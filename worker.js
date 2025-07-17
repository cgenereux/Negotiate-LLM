/**
 * Cloudflare Worker – OpenAI proxy with 100 k‑token daily cap.
 * Bindings required:
 *   1. Secret:  OPENAI_API_KEY
 *   2. KV:      CHAT_QUOTA        (added in dashboard; ID referenced in wrangler.toml)
 */

const DAILY_LIMIT = 100_000;                    // total tokens per UTC day
const ALLOW_ORIGIN = 'https://cgenereux.github.io';   // change if your site URL differs

export default {
  async fetch(req, env) {
    if (req.method !== 'POST')
      return new Response('POST only', { status: 405 });

    /* ---------- daily‑quota check -------------------------------- */
    const today = new Date().toISOString().slice(0, 10);           // "YYYY‑MM‑DD"
    const used  = +(await env.CHAT_QUOTA.get(today)) || 0;
    if (used >= DAILY_LIMIT)
      return new Response('Site quota exhausted for today', { status: 429 });

    /* ---------- forward request to OpenAI ------------------------ */
    const upstream = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: await req.text(),   // pass browser JSON verbatim
      },
    );

    /* ---------- update quota (best‑effort) ----------------------- */
    let tokens = 0;
    try {
      const j = await upstream.clone().json();
      tokens = j.usage?.total_tokens || 0;
    } catch (_) {
      // ignore if response is a streamed body
    }

    await env.CHAT_QUOTA.put(
      today,
      String(used + tokens),
      { expirationTtl: 172_800 }            // auto‑expire after two days
    );

    /* ---------- return response with CORS ------------------------ */
    const resp = new Response(upstream.body, upstream);
    resp.headers.set('Access-Control-Allow-Origin', ALLOW_ORIGIN);
    resp.headers.set('Access-Control-Allow-Headers', '*');
    return resp;
  },
};
