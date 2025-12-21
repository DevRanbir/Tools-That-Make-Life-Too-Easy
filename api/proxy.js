// Vercel Serverless Function - API Proxy to Backend
// This proxies all requests to your Azure backend server

const BACKEND_URL = 'http://20.197.35.140:5001';

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Get the path from query (e.g., /api/proxy?path=/api/process-stream)
        const path = req.query.path || '/api/process-stream';
        const targetUrl = `${BACKEND_URL}${path}`;

        console.log(`[PROXY] ${req.method} ${targetUrl}`);
        console.log(`[PROXY] Body:`, req.body);

        // Prepare request options
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        // Add body for POST/PUT/PATCH requests
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        // Forward the request to backend
        const response = await fetch(targetUrl, fetchOptions);

        // Handle streaming responses (for process-stream endpoint)
        if (path.includes('process-stream')) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                res.write(chunk);
            }

            res.end();
        } else {
            // Regular JSON response
            const data = await response.json();
            res.status(response.status).json(data);
        }

    } catch (error) {
        console.error('[PROXY ERROR]', error);
        res.status(500).json({ 
            error: 'Proxy error', 
            message: error.message,
            backend: BACKEND_URL 
        });
    }
}
