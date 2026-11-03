import type { TrackedMessage, TrackedOpen } from '@inlark/core'

export const openKinds: Record<TrackedOpen['kind'], { label: string; note: string }> = {
  reader: {
    label: 'Opened',
    note: 'Loaded directly by the recipient’s mail app.',
  },
  gmail: {
    label: 'Opened in Gmail',
    note: 'Gmail loads images through Google’s proxy when the message is opened, so the reader’s own IP and device are hidden.',
  },
  apple: {
    label: 'Apple Mail privacy',
    note: 'Apple Mail Privacy Protection can load images when mail arrives, even if nobody reads it.',
  },
  proxy: {
    label: 'Mail provider proxy',
    note: 'Loaded through a mail provider’s image proxy.',
  },
  early: {
    label: 'Seconds after sending',
    note: 'Usually a security scanner or your own copy, not the recipient.',
  },
  self: {
    label: 'Your network',
    note: 'Came from the same internet address as inlark, so probably you.',
  },
}

export const countsAsOpen = (open: TrackedOpen) => open.kind === 'reader' || open.kind === 'gmail'

/** Opens that point to the recipient reading the message, newest first. */
export const likelyOpens = (message: TrackedMessage) =>
  message.opens.filter(countsAsOpen).sort((a, b) => b.at.localeCompare(a.at))

export function device(userAgent: string): string {
  const ua = userAgent
  if (/GoogleImageProxy|ggpht\.com/i.test(ua)) return 'Gmail'
  if (/YahooMailProxy/i.test(ua)) return 'Yahoo Mail'
  if (/Microsoft Outlook|ms-office|MSOffice/i.test(ua)) return 'Outlook'
  if (/Thunderbird/i.test(ua)) return 'Thunderbird'
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/iPad/i.test(ua)) return 'iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return ua.trim() ? 'Unknown app' : 'No app given'
}

export const place = (open: TrackedOpen) => [open.city, open.country].filter(Boolean).join(', ')

const local = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' })

const people = (list: TrackedMessage['to']) =>
  list.map((a) => (a.name ? a.name + ' <' + a.email + '>' : a.email)).join(', ')

/** A plain-text record of a tracked message and every hit, for keeping or sharing as evidence. */
export function evidenceText(message: TrackedMessage, trackerUrl?: string): string {
  const opens = [...message.opens].sort((a, b) => a.at.localeCompare(b.at))
  const lines = [
    'Open-tracking record',
    '',
    'Subject: ' + (message.subject || '(no subject)'),
    'To: ' + (people(message.to) || '(none)'),
    ...(message.cc.length ? ['Cc: ' + people(message.cc)] : []),
    'Sent: ' + message.sentAt + ' (' + local(message.sentAt) + ')',
    'Message-ID: <' + message.messageId + '>',
    'Tracking id: ' + message.token + (trackerUrl ? ' (tracker ' + trackerUrl + ')' : ''),
    ...(message.recipients?.length
      ? [
          'Each recipient got their own copy with its own image:',
          ...message.recipients.map((r) => '  ' + r.email + ': tracking id ' + r.token),
        ]
      : []),
    '',
    opens.length
      ? 'Image loads: ' +
        opens.length +
        ', of which ' +
        opens.filter(countsAsOpen).length +
        ' look like the message being opened'
      : 'Image loads: none recorded',
    '',
  ]
  opens.forEach((open, index) => {
    lines.push(
      index +
        1 +
        '. ' +
        open.at +
        ' (' +
        local(open.at) +
        ')' +
        (open.recipient ? ', copy sent to ' + open.recipient : ''),
      '   ' + openKinds[open.kind].label + ': ' + openKinds[open.kind].note,
      '   IP ' +
        (open.ip || 'unknown') +
        (place(open) ? ', ' + place(open) : '') +
        (open.network ? ', ' + open.network : ''),
      '   App: ' + device(open.userAgent) + ' (user agent: ' + (open.userAgent || 'none') + ')',
      '',
    )
  })
  lines.push(
    'How this works: the message contained a 1×1 image unique to it. Each line above is a time the',
    'image was requested from the tracker, as logged by the tracker with the time (UTC), IP address,',
    'and user agent of the request. An image load is strong evidence that the message was displayed,',
    'but not proof that a person read it: some mail services load images automatically, and a',
    'recipient who blocks images is never recorded.',
  )
  return lines.join('\n')
}

const csvCell = (value: string) =>
  /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value

export function evidenceCsv(message: TrackedMessage): string {
  const rows = [
    ['time_utc', 'recipient', 'kind', 'ip', 'city', 'country', 'network', 'app', 'user_agent'],
    ...[...message.opens]
      .sort((a, b) => a.at.localeCompare(b.at))
      .map((o) => [
        o.at,
        o.recipient || '',
        openKinds[o.kind].label,
        o.ip,
        o.city || '',
        o.country || '',
        o.network || '',
        device(o.userAgent),
        o.userAgent,
      ]),
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n'
}
