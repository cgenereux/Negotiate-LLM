/* worker.js – OpenAI proxy + link‑generation storage (30‑day TTL) + CORS + quota */

/**
 * Bindings required in the dashboard:
 * 1. Secret  :  OPENAI_API_KEY
 * 2. KV      :  CHAT_QUOTA       – for daily token counting
 * 3. KV      :  NEG_DATA         – stores link payloads (to/from/request/context)
 */

const DAILY_LIMIT = 100_000;                   // tokens per UTC day
const LINK_TTL    = 30 * 24 * 3600;            // 30 days in seconds
const ALLOW_ORIGIN = 'https://cgenereux.github.io';  // front‑end origin

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    /* ----- CORS pre‑flight ----- */
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': ALLOW_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        }
      });
    }

    /* ===== 1. CREATE a new link =================================== */
    if (req.method === 'POST' && url.pathname === '/create') {
      const { to = '', from = '', request: rq = '', context = '' } = await req.json();
      const slug = randomSlug();
      await env.NEG_DATA.put(slug, JSON.stringify({ to, from, rq, context }), {
        expirationTtl: LINK_TTL
      });
      return json({ slug, url: `${ALLOW_ORIGIN}/chat.html?slug=${slug}` });
    }

    /* ===== 2. GET stored payload ================================== */
    if (req.method === 'GET' && url.pathname.startsWith('/payload/')) {
      const slug = url.pathname.split('/').pop();
      const data = await env.NEG_DATA.get(slug, 'json');
      if (!data) return new Response('Not found', { status: 404 });
      return json(data);
    }

    /* ===== 3. Proxy chat ========================================== */
    if (req.method === 'POST') {
      // Daily‑quota check
      const today = new Date().toISOString().slice(0, 10);
      const used  = +(await env.CHAT_QUOTA.get(today)) || 0;
      if (used >= DAILY_LIMIT)
        return new Response('Site quota exhausted for today', { status: 429 });

      // Forward to OpenAI
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`
        },
        body: await req.text()
      });

      // Update quota (best‑effort)
      let t = 0; try { t = (await upstream.clone().json()).usage?.total_tokens || 0; } catch {}
      await env.CHAT_QUOTA.put(today, String(used + t), { expirationTtl: 172800 });

      const resp = new Response(upstream.body, upstream);
      resp.headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
      resp.headers.set('Access-Control-Allow-Headers', '*');
      return resp;
    }

    return new Response('Not found', { status: 404 });
  }
};

/* ---------------- helpers ---------------- */
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
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
