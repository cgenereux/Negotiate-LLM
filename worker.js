/**
 * worker.js – proxy + link‑gen + precomputed intro + daily quota + CORS
 *
 * Bindings required:
 *   Secret: OPENAI_API_KEY
 *   KV:     CHAT_QUOTA
 *   KV:     NEG_DATA
 */

const DAILY_LIMIT = 100_000;                  // tokens per UTC day
const LINK_TTL    = 30 * 24 * 3600;           // 30 days in seconds
const ALLOW_ORIGIN = 'https://cgenereux.github.io';  // your GH Pages origin

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin':  ALLOW_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    //
    // 1) CREATE LINK + precompute intro
    //
    if (req.method === 'POST' && url.pathname === '/create') {
      const { to = '', from = '', request: rq = '', context = '' } = await req.json();
      const slug = randomSlug();

      // Build system prompt for the intro
      const sys = 
        `You are o3, an expert negotiator helping facilitate a friendly conversation.\n` +
        `${from || 'Someone'} asked: ${rq}\n\n` +
        `PRIVATE CONTEXT (never reveal):\n${context}\n\n` +
        `Your first message should greet ${to || 'there'}, mention that ${from || 'someone'} asked for your help, ` +
        `and invite them to discuss. Do NOT reveal private context or push drastic actions immediately.`;

      // Call OpenAI once to get the intro
      const openaiResp = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model:    'o3',
            messages: [{ role: 'system', content: sys }],
          }),
        }
      );
      const openaiJson = await openaiResp.json();
      const intro = openaiJson.choices[0].message.content.trim();

      // Store payload + precomputed intro in KV
      await env.NEG_DATA.put(
        slug,
        JSON.stringify({ to, from, rq, context, intro }),
        { expirationTtl: LINK_TTL }
      );

      // Return the link
      return json({
        slug,
        url: `${ALLOW_ORIGIN}/Negotiate-LLM/chat.html?slug=${slug}`
      });
    }

    //
    // 2) FETCH STORED PAYLOAD
    //
    if (req.method === 'GET' && url.pathname.startsWith('/payload/')) {
      const slug = url.pathname.split('/').pop();
      const data = await env.NEG_DATA.get(slug, 'json');
      if (!data) return new Response('Not found', { status: 404 });
      return json(data);
    }

    //
    // 3) PROXY CHAT
    //
    if (req.method === 'POST') {
      // Quota check
      const today = new Date().toISOString().slice(0, 10);
      const used  = +(await env.CHAT_QUOTA.get(today)) || 0;
      if (used >= DAILY_LIMIT) {
        return new Response('Site quota exhausted for today', { status: 429 });
      }

      // Forward to OpenAI
      const upstream = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          },
          body: await req.text(),
        }
      );

      // Update quota (best‐effort)
      let tokens = 0;
      try {
        const j = await upstream.clone().json();
        tokens = j.usage?.total_tokens || 0;
      } catch (_) {}
      await env.CHAT_QUOTA.put(today, String(used + tokens), {
        expirationTtl: 172800
      });

      // Return with CORS
      const resp = new Response(upstream.body, upstream);
      resp.headers.set('Access-Control-Allow-Origin',  ALLOW_ORIGIN);
      resp.headers.set('Access-Control-Allow-Headers', '*');
      return resp;
    }

    // Fallback
    return new Response('Not found', { status: 404 });
  }
};

// Helpers
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Headers': '*'
    }
  });
}

function randomSlug(len = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}
