// Open tracking: a 1×1 image in each tracked message, served and logged by the public tracker
// in /tracker (a Cloudflare Worker). inlark keeps the log of opens and pulls new hits from it.
import { createHmac, randomBytes } from 'node:crypto'
import type { Address, TrackedMessage, TrackedOpen, TrackingSettings } from '@inlark/core'

/** The tracking settings when they are complete enough to use. */
export const readyTracking = (settings?: TrackingSettings) =>
  settings && /^https:\/\/[^/\s]+/.test(settings.url) && settings.secret.length >= 32
    ? settings
    : undefined

const base = (url: string) => url.trim().replace(/\/+$/, '')

/** A random id and its signature, so the tracker logs only tokens this inlark made. */
export function trackingToken(secret: string): { id: string; token: string } {
  const id = randomBytes(16).toString('base64url')
  const signature = createHmac('sha256', secret).update(id).digest().subarray(0, 12)
  return { id, token: id + '.' + signature.toString('base64url') }
}
export const pixelUrl = (settings: TrackingSettings, token: string) =>
  base(settings.url) + '/p/' + token + '.gif'

/** True for any pixel URL of this tracker, so inlark never loads one itself. */
export function isTrackerUrl(value: string, configured?: TrackingSettings): boolean {
  const settings = readyTracking(configured)
  if (!settings) return false
  try {
    const url = new URL(value)
    const tracker = new URL(base(settings.url))
    return url.host === tracker.host && /^\/p\/[^/]+\.gif$/.test(url.pathname)
  } catch {
    return false
  }
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Adds the pixel at the end of the message. Pixels quoted from earlier tracked messages are
 * removed first, so a reply never reports opens for the message it quotes.
 */
export function injectPixel(html: string, settings: TrackingSettings, token: string): string {
  const own = new RegExp(
    '<img\\b[^>]*\\bsrc=["\']?' + escapeRegExp(base(settings.url)) + '/p/[^"\'\\s>]+[^>]*>',
    'gi',
  )
  const image =
    '<img src="' +
    pixelUrl(settings, token) +
    '" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0" />'
  const body = html.replace(own, '')
  return /<\/body>/i.test(body) ? body.replace(/<\/body>/i, image + '</body>') : body + image
}

export interface TrackerHit {
  id: number
  token: string
  at: string
  ip: string
  ua: string
  country: string
  city: string
  asn: number
  org: string
}

/** Sorts a hit by how much it says about a person actually reading the message. */
export function classifyOpen(
  hit: TrackerHit,
  sentAt: string,
  caller?: string,
): TrackedOpen['kind'] {
  if (caller && hit.ip === caller) return 'self'
  if (/GoogleImageProxy|via ggpht\.com/i.test(hit.ua)) return 'gmail'
  // Apple Mail Privacy Protection loads images on delivery through Apple's relays.
  if (/apple/i.test(hit.org) || hit.ua.trim() === 'Mozilla/5.0') return 'apple'
  if (Date.parse(hit.at) - Date.parse(sentAt) < 15_000) return 'early'
  if (/YahooMailProxy/i.test(hit.ua)) return 'proxy'
  return 'reader'
}
export const countsAsOpen = (open: TrackedOpen) => open.kind === 'reader' || open.kind === 'gmail'

export type FetchJson = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/** Pulls every hit after `cursor`. Throws a readable error when the tracker can't be used. */
export async function fetchHits(
  settings: TrackingSettings,
  cursor: number,
  fetchJson: FetchJson = fetch as unknown as FetchJson,
): Promise<{ hits: TrackerHit[]; caller: string }> {
  const hits: TrackerHit[] = []
  let caller = ''
  for (let page = 0; page < 40; page++) {
    let response
    try {
      response = await fetchJson(base(settings.url) + '/api/hits?after=' + cursor, {
        headers: { Authorization: 'Bearer ' + settings.secret },
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      throw new Error('The tracker couldn’t be reached. Check its address.')
    }
    if (response.status === 401) throw new Error('The tracker refused the secret.')
    if (!response.ok)
      throw new Error('The tracker answered with an error (' + response.status + ').')
    const body = (await response.json()) as { hits?: TrackerHit[]; caller?: string }
    if (!Array.isArray(body.hits)) throw new Error('That address isn’t an inlark tracker.')
    caller = body.caller || caller
    hits.push(...body.hits)
    if (body.hits.length < 500) break
    cursor = body.hits[body.hits.length - 1].id
  }
  return { hits, caller }
}

/** Adds new hits to the tracked messages they belong to. Returns those that gained a first open. */
export function applyHits(
  messages: TrackedMessage[],
  hits: TrackerHit[],
  caller: string,
): TrackedMessage[] {
  const byToken = new Map(messages.map((m) => [m.token, m]))
  const firstOpened: TrackedMessage[] = []
  for (const hit of hits) {
    const message = byToken.get(hit.token)
    if (!message || message.opens.some((o) => o.hit === hit.id)) continue
    const wasOpened = message.opens.some(countsAsOpen)
    const open: TrackedOpen = {
      hit: hit.id,
      at: hit.at,
      ip: hit.ip,
      userAgent: hit.ua,
      country: hit.country || undefined,
      city: hit.city || undefined,
      network: hit.org || undefined,
      kind: classifyOpen(hit, message.sentAt, caller),
    }
    message.opens.push(open)
    if (!wasOpened && countsAsOpen(open)) firstOpened.push(message)
  }
  return firstOpened
}

export function openedNotice(message: TrackedMessage): string {
  const everyone = [...message.to, ...message.cc]
  // With several recipients a single pixel can't say who opened it.
  const who: Address | undefined = everyone.length === 1 ? everyone[0] : undefined
  const subject = message.subject ? '“' + message.subject + '”' : 'your message'
  return who ? (who.name || who.email) + ' opened ' + subject + '.' : subject + ' was opened.'
}
