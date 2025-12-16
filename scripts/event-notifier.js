import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Configuration ---
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const NOTIFICATION_WINDOW_MIN = 2;   // Notify 2 minutes before
const NOTIFICATION_BUFFER_SEC = 30;  // Window: 2m +/- 30s
const CLEANUP_AGE_MS = 15 * 60 * 1000; // Cleanup tracked IDs after 15 mins

// --- Env Loader ---
function loadEnv() {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const envPath = path.resolve(__dirname, '../.env');

    if (!fs.existsSync(envPath)) {
        console.warn('⚠️  .env file not found at:', envPath);
        return {};
    }

    const content = fs.readFileSync(envPath, 'utf-8');
    const env = {};

    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        // Split on first '=' only
        const parts = trimmed.split('=');
        const key = parts[0].trim();
        let value = parts.slice(1).join('=').trim();

        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        env[key] = value;
    });

    return env;
}

const env = loadEnv();

// --- Validation ---
const requiredKeys = ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN', 'FROM_EMAIL', 'VITE_SUPABASE_URL'];
const missingKeys = requiredKeys.filter(k => !env[k]);

if (missingKeys.length > 0) {
    console.error('❌ Missing required .env variables:', missingKeys.join(', '));
    process.exit(1);
}

// Check for Service Role Key (Required for cron/admin tasks)
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
    console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env');
    console.error('   A Service Role Key is required to bypass RLS and fetch user emails for notifications.');
    console.error('   Please retrieve it from your Supabase Dashboard > Project Settings > API.');
    process.exit(1);
}

// --- Supabase Admin Client ---
const supabase = createClient(env.VITE_SUPABASE_URL, serviceRoleKey);

// --- State Tracking ---
// We track event IDs we've already notified to prevent duplicates in a short window
const notifiedEvents = new Set();
const notifiedTimestamps = new Map(); // id -> timestamp (for cleanup)

// --- Mailgun Sender ---
async function sendEmail(toEmail, eventTitle, startTime) {
    const apiKey = env.MAILGUN_API_KEY;
    const domain = env.MAILGUN_DOMAIN;
    const fromEmail = env.FROM_EMAIL;

    if (!toEmail) {
        console.warn('⚠️  No email address provided for notification.');
        return false;
    }

    const auth = Buffer.from(`api:${apiKey}`).toString('base64');
    const formData = new URLSearchParams();
    formData.append('from', fromEmail);
    formData.append('to', toEmail);
    formData.append('subject', `Reminder: "${eventTitle}" starts in 2 minutes!`);
    const formattedTime = new Date(startTime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
        timeZone: 'Asia/Kolkata' // IST Timezone
    });

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
            .header { background: #18181b; padding: 24px; text-align: center; }
            .header h1 { color: #ffffff; margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.025em; }
            .content { padding: 32px 24px; text-align: center; }
            .label { color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; margin-bottom: 8px; display: block; }
            .title { color: #18181b; font-size: 24px; font-weight: 700; margin: 0 0 8px 0; line-height: 1.3; }
            .time { color: #6366f1; font-size: 18px; font-weight: 500; margin-bottom: 24px; display: block; }
            .btn { display: inline-block; background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 14px; transition: background-color 0.2s; }
            .btn:hover { background-color: #27272a; }
            .footer { background: #fafafa; padding: 16px; text-align: center; font-size: 12px; color: #a1a1aa; border-top: 1px solid #f4f4f5; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>AIOS Reminder</h1>
            </div>
            <div class="content">
                <span class="label">Event Starting Soon</span>
                <h2 class="title">${eventTitle}</h2>
                <span class="time">${formattedTime}</span>
                <p style="color: #52525b; font-size: 14px; margin-bottom: 32px;">Just a quick reminder that your scheduled event is starting in about 2 minutes.</p>
                <a href="${env.VITE_SUPABASE_URL ? 'https://google.com' : 'http://localhost:5173'}" class="btn">Open Dashboard</a>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} AIOS. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    `;

    formData.append('text', `Hi there,\n\nJust a quick reminder that your event "${eventTitle}" is starting at ${formattedTime}.\n\nBest,\nAIOS Team`); // Fallback
    formData.append('html', html);

    try {
        const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Mailgun API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        console.log(`✅ Email sent to ${toEmail} for event: "${eventTitle}"`);
        return true;
    } catch (error) {
        console.error(`❌ Failed to send email to ${toEmail}:`, error.message);
        return false;
    }
}

// --- Main Logic ---
async function checkAndNotify() {
    const now = new Date();
    // Target window center: Now + 2 minutes
    const targetTime = new Date(now.getTime() + NOTIFICATION_WINDOW_MIN * 60000);

    // Window range: +/- 30 seconds
    const startRange = new Date(targetTime.getTime() - NOTIFICATION_BUFFER_SEC * 1000).toISOString();
    const endRange = new Date(targetTime.getTime() + NOTIFICATION_BUFFER_SEC * 1000).toISOString();

    console.log(`[${now.toLocaleTimeString()}] Checking for events starting between ${new Date(startRange).toLocaleTimeString()} and ${new Date(endRange).toLocaleTimeString()}...`);

    try {
        const { data: events, error } = await supabase
            .from('events')
            .select('*')
            .gte('start_time', startRange) /* >= */
            .lte('start_time', endRange);  /* <= */

        if (error) throw error;

        if (events && events.length > 0) {
            console.log(`Found ${events.length} potential event(s).`);

            for (const event of events) {
                if (notifiedEvents.has(event.id)) {
                    // Already notified
                    continue;
                }

                console.log(`Processing event: ${event.title} (User: ${event.user_id})`);

                // 1. Fetch User Email
                const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(event.user_id);

                if (userError || !user) {
                    console.error(`   Could not fetch user ${event.user_id}:`, userError?.message);
                    continue;
                }

                const userEmail = user.email;

                // 2. Send Email
                const sent = await sendEmail(userEmail, event.title, event.start_time);

                if (sent) {
                    // 3. Track as notified
                    notifiedEvents.add(event.id);
                    notifiedTimestamps.set(event.id, Date.now());
                }
            }
        } else {
            // console.log('No events found in this window.');
        }

    } catch (err) {
        console.error('Error querying events:', err.message);
    }

    cleanupTracking();
}

function cleanupTracking() {
    const now = Date.now();
    for (const [id, time] of notifiedTimestamps.entries()) {
        if (now - time > CLEANUP_AGE_MS) {
            notifiedEvents.delete(id);
            notifiedTimestamps.delete(id);
        }
    }
}

// --- Start ---
console.log('🚀 AIOS Event Notification Worker Started');
console.log(`   Check Interval: ${CHECK_INTERVAL_MS / 1000}s`);
console.log(`   Notification: ${NOTIFICATION_WINDOW_MIN}m before start`);
console.log('   Press Ctrl+C to stop.');

// Run immediately
checkAndNotify();

// Schedule
setInterval(checkAndNotify, CHECK_INTERVAL_MS);
