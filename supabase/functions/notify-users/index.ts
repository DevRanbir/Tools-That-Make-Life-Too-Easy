/// <reference lib="deno.ns" />
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// Configuration
const NOTIFICATION_WINDOW_MIN = 2;
const NOTIFICATION_BUFFER_SEC = 30;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Initialize Supabase Client (Service Role for Admin Access)
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        const mailgunApiKey = Deno.env.get('MAILGUN_API_KEY') ?? ''
        const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN') ?? ''
        const fromEmail = Deno.env.get('FROM_EMAIL') ?? ''

        if (!supabaseUrl || !supabaseServiceKey || !mailgunApiKey || !mailgunDomain) {
            throw new Error('Missing environment variables')
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // 2. Calculate Time Window
        const now = new Date();
        const targetTime = new Date(now.getTime() + NOTIFICATION_WINDOW_MIN * 60000);
        const startRange = new Date(targetTime.getTime() - NOTIFICATION_BUFFER_SEC * 1000).toISOString();
        const endRange = new Date(targetTime.getTime() + NOTIFICATION_BUFFER_SEC * 1000).toISOString();

        console.log(`Checking events around ${targetTime.toISOString()} (+/- ${NOTIFICATION_BUFFER_SEC}s)`)

        // 3. Fetch Events Starting Soon
        const { data: startingEvents, error: startError } = await supabase
            .from('events')
            .select('*')
            .gte('start_time', startRange) /* >= */
            .lte('start_time', endRange);  /* <= */

        if (startError) throw startError;

        // 4. Fetch Events Ending Soon
        const { data: endingEvents, error: endError } = await supabase
            .from('events')
            .select('*')
            .gte('end_time', startRange)
            .lte('end_time', endRange);

        if (endError) throw endError;

        // Combine events with a type identifier
        const allNotifications = [
            ...(startingEvents || []).map(e => ({ event: e, type: 'start' })),
            ...(endingEvents || []).map(e => ({ event: e, type: 'end' }))
        ];

        const results = [];

        if (allNotifications.length > 0) {
            console.log(`Found ${allNotifications.length} notifications to send`)

            for (const { event, type } of allNotifications) {
                // Fetch User Email
                const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(event.user_id)

                if (userError || !user || !user.email) {
                    console.error(`User not found for event ${event.id}`)
                    continue;
                }

                // Prepare Email Content
                const isStart = type === 'start';
                const actionVerb = isStart ? 'starts' : 'ends';
                const actionIng = isStart ? 'starting' : 'ending';
                const timeValue = isStart ? event.start_time : event.end_time;
                
                const formattedTime = new Date(timeValue).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: 'numeric',
                    hour12: true,
                    timeZone: 'Asia/Kolkata'
                });

                // Fallback for user name or email prefix
                const userName = user.user_metadata?.full_name || user.email.split('@')[0] || 'User';
                
                // Optional sections
                const descriptionHtml = event.description ? `<div style="background-color: #f4f4f5; padding: 12px; border-radius: 8px; margin: 16px 0; color: #52525b; font-size: 14px; font-style: italic;">"${event.description}"</div>` : '';
                const locationHtml = event.location ? `<p style="color: #52525b; font-size: 14px; margin-top: 8px; font-weight: 500;">📍 ${event.location}</p>` : '';

                // HTML Template
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
                <h1>TOOLS THAT MAKE LIFE <br /> TOO EASY <br /> - Reminder -</h1>
            </div>
            <div class="content">
                <span class="label">Hello ${userName}, Event ${actionIng} Soon</span>
                <h2 class="title">${event.title}</h2>
                <span class="time">${formattedTime}</span>
                <p style="color: #52525b; font-size: 14px; margin-bottom: 16px;">Just a quick reminder that your scheduled event is ${actionIng} in about 2 minutes.</p>
                ${locationHtml}
                ${descriptionHtml}
                <div style="margin-top: 32px;">
                    <a href="https://tools-that-make-life-too-easy.appwrite.network" class="btn">Open Dashboard</a>
                </div>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} AIOS. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    `;

                // Send Email via Mailgun
                const auth = btoa(`api:${mailgunApiKey}`)
                const formData = new FormData()
                formData.append('from', fromEmail)
                formData.append('to', user.email)
                formData.append('subject', `Reminder: "${event.title}" ${actionVerb} in 2 minutes!`)
                formData.append('text', `Your event "${event.title}" is ${actionIng} soon at ${formattedTime}. ${event.location ? 'Location: ' + event.location : ''}`)
                formData.append('html', html);

                const resp = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${auth}` },
                    body: formData
                })

                if (!resp.ok) {
                    const err = await resp.text()
                    console.error(`Mailgun Error: ${err}`)
                    results.push({ id: event.id, status: 'failed', error: err })
                } else {
                    console.log(`Email sent to ${user.email} (${type})`)
                    results.push({ id: event.id, status: 'sent', email: user.email, type })
                }
            }
        }

        return new Response(JSON.stringify({ success: true, processed: results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
