/*  Cloudflare Worker: proxy to OpenAI + 100 k‑token daily cap  */

const DAILY_LIMIT = 100_000;            // total tokens allowed per UTC day

export default {
  async fetch(req, env) {
    if (req.method !== 'POST')
      return new Response('POST only', { status: 405 });

    /* --- quota check --------------------------------------- */
    const today = new Date().toISOString().slice(0, 10);     // e.g. “2025‑07‑16”
    const used  = +(await env.CHAT_QUOTA.get(today)) || 0;
    if (used >= DAILY_LIMIT)
      return new Response('Site quota exhausted for today', { status: 429 });

    /* --- forward request to OpenAI ------------------------- */
    const upstream = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: await req.text(),
      },
    );

    /* --- update quota (best‑effort) ------------------------ */
    let tokens = 0;
    try {
      const clone = upstream.clone();
      const j = await clone.json();
      tokens = j.usage?.total_tokens || 0;
    } catch (_) { /* non‑JSON/streaming; ignore */ }

    await env.CHAT_QUOTA.put(
      today,
      String(used + tokens),
      { expirationTtl: 172800 }          // auto‑expire after two days
    );

    /* --- stream response back, add CORS -------------------- */
    const resp = new Response(upstream.body, upstream);
    resp.headers.set('Access-Control-Allow-Origin',
                     'https://<your‑gh‑pages>.github.io');   // change if needed
    resp.headers.set('Access-Control-Allow-Headers', '*');
    return resp;
  },
};
