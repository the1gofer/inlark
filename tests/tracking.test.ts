import { describe, expect, it } from 'vitest'
import worker from '../tracker/worker.js'
import {
  classifyOpen,
  fetchHits,
  injectPixel,
  isTrackerUrl,
  trackingToken,
} from '../apps/desktop/src/main/tracking'
import { evidenceCsv, evidenceText } from '../apps/desktop/src/renderer/src/tracking-text'
import type { TrackedMessage } from '../packages/core/src'

const settings = {
  url: 'https://t.example.dev',
  secret: 'another-secret-that-is-long-enough-0001',
  byDefault: true,
}
function fakeEnv(rows: any[] = []) {
  const inserted: unknown[][] = []
  return {
    inserted,
    env: {
      TRACKER_SECRET: settings.secret,
      DB: {
        prepare: (sql: string) => ({
          bind: (...values: unknown[]) => ({
            run: async () => inserted.push(values),
            all: async () => ({
              results: sql.startsWith('SELECT') ? rows.filter((r) => r.id > Number(values[0])) : [],
            }),
          }),
        }),
      },
    },
  }
}
const call = async (request: Request, env: any) => {
  const waits: Promise<unknown>[] = []
  const response = await worker.fetch(request, env, { waitUntil: (p: any) => waits.push(p) })
  await Promise.all(waits)
  return response
}

describe('tracker worker', () => {
  it('logs signed pixels with the reader details and never caches them', async () => {
    const { id, token } = trackingToken(settings.secret)
    const { env, inserted } = fakeEnv()
    const response = await call(
      new Request(settings.url + '/p/' + token + '.gif', {
        headers: { 'CF-Connecting-IP': '198.51.100.4', 'User-Agent': 'Thunderbird' },
      }),
      env,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(new Uint8Array(await response.arrayBuffer()).slice(0, 3)).toEqual(
      new TextEncoder().encode('GIF'),
    )
    expect(inserted).toEqual([
      [id, expect.any(String), '198.51.100.4', 'Thunderbird', '', '', 0, ''],
    ])
  })
  it('serves an image for forged tokens but logs nothing', async () => {
    const { env, inserted } = fakeEnv()
    const { token } = trackingToken('a-different-secret-that-is-also-long-00')
    const response = await call(new Request(settings.url + '/p/' + token + '.gif'), env)
    expect(response.headers.get('Content-Type')).toBe('image/gif')
    expect(inserted).toEqual([])
  })
  it('shows the log only with the secret', async () => {
    const { env } = fakeEnv([{ id: 1 }, { id: 2 }])
    expect((await call(new Request(settings.url + '/api/hits'), env)).status).toBe(401)
    const wrong = new Request(settings.url + '/api/hits', {
      headers: { Authorization: 'Bearer nope' },
    })
    expect((await call(wrong, env)).status).toBe(401)
    const right = new Request(settings.url + '/api/hits?after=1', {
      headers: { Authorization: 'Bearer ' + settings.secret, 'CF-Connecting-IP': '203.0.113.9' },
    })
    expect(await (await call(right, env)).json()).toEqual({
      hits: [{ id: 2 }],
      caller: '203.0.113.9',
    })
  })
  it('refuses to run with a short secret', async () => {
    const { env } = fakeEnv()
    env.TRACKER_SECRET = 'short'
    const request = new Request(settings.url + '/api/hits', {
      headers: { Authorization: 'Bearer short' },
    })
    expect((await call(request, env)).status).toBe(401)
  })
})

describe('open tracking in inlark', () => {
  it('puts one pixel in the message and drops pixels quoted from earlier ones', () => {
    const quoted =
      '<p>Thanks</p><blockquote><p>Old</p><img src="https://t.example.dev/p/old.sig.gif" width="1" height="1"></blockquote>'
    const html = injectPixel(quoted, settings, 'new.sig')
    expect(html).not.toContain('/p/old.sig.gif')
    expect(html.match(/<img/g)).toHaveLength(1)
    expect(html).toMatch(/<img src="https:\/\/t\.example\.dev\/p\/new\.sig\.gif"[^>]*>$/)
    expect(injectPixel('<html><body><p>Hi</p></body></html>', settings, 'x.y')).toMatch(
      /x\.y\.gif"[^>]*><\/body>/,
    )
  })
  it('recognises only its own pixel addresses', () => {
    expect(isTrackerUrl('https://t.example.dev/p/a.b.gif', settings)).toBe(true)
    expect(isTrackerUrl('https://t.example.dev/logo.png', settings)).toBe(false)
    expect(isTrackerUrl('https://elsewhere.dev/p/a.b.gif', settings)).toBe(false)
    expect(isTrackerUrl('https://t.example.dev/p/a.b.gif', undefined)).toBe(false)
  })
  it('sorts hits by what they say about a person reading', () => {
    const sentAt = '2026-11-03T10:00:00.000Z'
    const hit = (patch: object) => ({
      id: 1,
      token: 't',
      at: '2026-11-03T11:00:00.000Z',
      ip: '198.51.100.1',
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)',
      country: 'US',
      city: '',
      asn: 1,
      org: 'Verizon',
      ...patch,
    })
    expect(classifyOpen(hit({}), sentAt)).toBe('reader')
    expect(classifyOpen(hit({ ua: 'Mozilla/5.0 (via ggpht.com GoogleImageProxy)' }), sentAt)).toBe(
      'gmail',
    )
    expect(classifyOpen(hit({ ua: 'Mozilla/5.0' }), sentAt)).toBe('apple')
    expect(classifyOpen(hit({ org: 'Apple Inc.' }), sentAt)).toBe('apple')
    expect(classifyOpen(hit({ at: '2026-11-03T10:00:05.000Z' }), sentAt)).toBe('early')
    expect(classifyOpen(hit({}), sentAt, '198.51.100.1')).toBe('self')
  })
  it('reads every page of hits and explains tracker problems', async () => {
    const pages = [Array.from({ length: 500 }, (_, i) => ({ id: i + 1 })), [{ id: 501 }]]
    const seen: string[] = []
    const result = await fetchHits(settings, 0, async (url) => {
      seen.push(url)
      return {
        ok: true,
        status: 200,
        json: async () => ({ hits: pages.shift(), caller: '1.1.1.1' }),
      }
    })
    expect(result.hits).toHaveLength(501)
    expect(seen).toEqual([
      'https://t.example.dev/api/hits?after=0',
      'https://t.example.dev/api/hits?after=500',
    ])
    await expect(
      fetchHits(settings, 0, async () => ({ ok: false, status: 401, json: async () => ({}) })),
    ).rejects.toThrow('refused the secret')
    await expect(
      fetchHits(settings, 0, async () => {
        throw new Error('ENOTFOUND')
      }),
    ).rejects.toThrow('couldn’t be reached')
  })
  it('writes a record of every image load for keeping as evidence', () => {
    const message: TrackedMessage = {
      token: 'abc',
      accountId: 'a',
      messageId: 'id@example.com',
      subject: 'Lease, renewal',
      to: [{ name: 'Dana', email: 'dana@example.com' }],
      cc: [],
      sentAt: '2026-11-03T10:00:00.000Z',
      opens: [
        {
          hit: 2,
          at: '2026-11-03T12:00:00.000Z',
          ip: '66.249.84.7',
          userAgent: 'x GoogleImageProxy',
          kind: 'gmail',
        },
        {
          hit: 1,
          at: '2026-11-03T11:00:00.000Z',
          ip: '198.51.100.1',
          userAgent: 'Mozilla/5.0 (iPhone)',
          city: 'Austin',
          country: 'US',
          kind: 'reader',
        },
      ],
    }
    const text = evidenceText(message)
    expect(text).toContain('Message-ID: <id@example.com>')
    expect(text).toContain('Image loads: 2, of which 2 look like the message being opened')
    expect(text.indexOf('2026-11-03T11:00:00.000Z')).toBeLessThan(
      text.indexOf('2026-11-03T12:00:00.000Z'),
    )
    expect(text).toContain('IP 198.51.100.1, Austin, US')
    const csv = evidenceCsv(message).trim().split('\n')
    expect(csv[0]).toBe('time_utc,recipient,kind,ip,city,country,network,app,user_agent')
    expect(csv[1]).toBe(
      '2026-11-03T11:00:00.000Z,,Opened,198.51.100.1,Austin,US,,iPhone,Mozilla/5.0 (iPhone)',
    )
  })
})
