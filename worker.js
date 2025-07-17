const DAILY_LIMIT = 100_000;  // total tokens allowed per UTC day
const ALLOW_ORIGIN = 'https://cgenereux.github.io';  // your site origin

export default {
  async fetch(req, env) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': ALLOW_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    // Only allow POST for chat
    if (req.method !== 'POST') {
      return new Response('POST only', { status: 405 });
    }

    // Check daily quota
    const today = new Date().toISOString().slice(0, 10);         // e.g. "2025-07-17"
    const used  = +(await env.CHAT_QUOTA.get(today)) || 0;
    if (used >= DAILY_LIMIT) {
      return new Response('Site quota exhausted for today', { status: 429 });
    }

    // Proxy the request to OpenAI
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: await req.text(),  // pass through JSON
    });

    // Parse usage and update quota (best-effort)
    let tokens = 0;
    try {
      const data = await upstream.clone().json();
      tokens = data.usage?.total_tokens || 0;
    } catch (_) {
      // If streaming or non-JSON, ignore
    }
    await env.CHAT_QUOTA.put(
      today,
      String(used + tokens),
      { expirationTtl: 172800 }  // auto-expire after 2 days
    );

    // Stream response back with CORS headers
    const response = new Response(upstream.body, upstream);
    response.headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
    response.headers.set('Access-Control-Allow-Headers', '*');
    return response;
  }
};
