// inlark open tracker: a Cloudflare Worker that serves the 1×1 pixel inlark puts in sent mail
// and keeps a log of every time it is loaded. inlark itself runs on a private network, so this
// is the only public part. It never sees message content: only a random token per message.
//
//   GET  /p/<token>.gif   public. Logs the hit when the token is signed with TRACKER_SECRET.
//   GET  /api/hits?after=<id>   Bearer TRACKER_SECRET. Hits after the given id, oldest first.
//
// Hits are stored in the D1 database bound as DB (see wrangler.toml and schema.sql).

const GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) =>
  c.charCodeAt(0),
)
const TOKEN = /^\/p\/([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{16})\.gif$/
const encoder = new TextEncoder()

function base64url(bytes) {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function signature(secret, id) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(id)))
  return base64url(mac.slice(0, 12))
}
function equal(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
function pixel() {
  return new Response(GIF, {
    headers: {
      'Content-Type': 'image/gif',
      // Every open must reach the Worker; nothing may serve it from a cache.
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  })
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const secret = env.TRACKER_SECRET || ''
    const match = TOKEN.exec(url.pathname)
    if (match && request.method === 'GET') {
      if (secret.length >= 32 && equal(await signature(secret, match[1]), match[2])) {
        const cf = request.cf || {}
        const hit = env.DB.prepare(
          'INSERT INTO hits (token, at, ip, ua, country, city, asn, org) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(
          match[1],
          new Date().toISOString(),
          request.headers.get('CF-Connecting-IP') || '',
          (request.headers.get('User-Agent') || '').slice(0, 512),
          cf.country || '',
          cf.city || '',
          Number(cf.asn) || 0,
          String(cf.asOrganization || '').slice(0, 200),
        )
        ctx.waitUntil(hit.run().catch(() => {}))
      }
      // A bad token still gets an image, so nothing looks broken to the reader.
      return pixel()
    }
    if (url.pathname === '/api/hits' && request.method === 'GET') {
      const auth = request.headers.get('Authorization') || ''
      if (secret.length < 32 || !equal(auth, 'Bearer ' + secret))
        return json({ error: 'unauthorized' }, 401)
      const after = Math.max(0, Number(url.searchParams.get('after')) || 0)
      const { results } = await env.DB.prepare(
        'SELECT id, token, at, ip, ua, country, city, asn, org FROM hits WHERE id > ? ORDER BY id LIMIT 500',
      )
        .bind(after)
        .all()
      // The caller's own address lets inlark mark opens that came from your own network.
      return json({ hits: results, caller: request.headers.get('CF-Connecting-IP') || '' })
    }
    return new Response('Not found', { status: 404 })
  },
}
