import type { MailQuery } from './model'

/** Operators the search box understands, as in Gmail and Superhuman. */
export const searchOperators = [
  'from',
  'to',
  'subject',
  'has',
  'is',
  'after',
  'before',
  'newer_than',
  'older_than',
] as const
export type SearchOperator = (typeof searchOperators)[number]

/** One piece of the typed search, with its place in the text so the box can highlight it. */
export interface SearchToken {
  start: number
  end: number
  /** Set when the piece is a recognized operator such as `from:karla`. */
  operator?: SearchOperator
  value: string
}

/** What a search asks for: plain words in `text`, operators in their own fields. */
export type ParsedSearch = Pick<
  MailQuery,
  'text' | 'from' | 'to' | 'subject' | 'after' | 'before' | 'hasAttachment' | 'unread'
> & { starred?: boolean }

const pattern = /([A-Za-z_]+):(?:"([^"]*)"?|(\S*))|"[^"]*"?|\S+/g
const unitDays: Record<string, number> = { d: 1, w: 7, m: 30, y: 365 }

/** `2024/1/5` or `2024-01-05` as UTC midnight, the way picked filter days are stored. */
function day(value: string): string | undefined {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value)
  if (!m) return undefined
  const date = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!))
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== +m[3]!
    ? undefined
    : date.toISOString()
}
function ago(value: string, now: Date): string | undefined {
  const m = /^(\d+)([dwmy])$/i.exec(value)
  return m
    ? new Date(now.getTime() - +m[1]! * unitDays[m[2]!.toLowerCase()]! * 86_400_000).toISOString()
    : undefined
}

/** Applies one operator; returns false when its value means nothing, so it stays plain text. */
function apply(search: ParsedSearch, operator: SearchOperator, value: string, now: Date) {
  const v = value.toLowerCase()
  switch (operator) {
    case 'from':
    case 'to':
    case 'subject':
      if (!value) return false
      search[operator] = value
      return true
    case 'has':
      if (v !== 'attachment' && v !== 'attachments') return false
      search.hasAttachment = true
      return true
    case 'is':
      if (v === 'unread') search.unread = true
      else if (v === 'starred') search.starred = true
      else return false
      return true
    case 'after':
    case 'before':
    case 'newer_than':
    case 'older_than': {
      const date = operator === 'after' || operator === 'before' ? day(value) : ago(value, now)
      if (!date) return false
      search[operator === 'after' || operator === 'newer_than' ? 'after' : 'before'] = date
      return true
    }
  }
}

/**
 * Splits a typed search into operators and plain words. Unknown operators, or ones with a value
 * that means nothing (`has:pizza`), stay in the plain text and are searched as typed.
 */
export function parseSearch(
  input: string,
  now = new Date(),
): {
  tokens: SearchToken[]
  search: ParsedSearch
} {
  const tokens: SearchToken[] = []
  const search: ParsedSearch = {}
  const words: string[] = []
  for (const m of input.matchAll(pattern)) {
    const start = m.index!
    const end = start + m[0].length
    const name = m[1]?.toLowerCase() as SearchOperator | undefined
    const value = (m[2] ?? m[3] ?? '').trim()
    if (name && searchOperators.includes(name) && apply(search, name, value, now)) {
      tokens.push({ start, end, operator: name, value })
    } else {
      tokens.push({ start, end, value: m[0] })
      words.push(m[0])
    }
  }
  const text = words.join(' ').trim()
  if (text) search.text = text
  return { tokens, search }
}

/** A Gmail search (`X-GM-RAW`) for a query, so Gmail's own index answers it. */
export function gmailSearch(query: MailQuery): string {
  const quote = (value: string) => {
    const v = value.replace(/"/g, '').trim()
    return /\s/.test(v) ? '"' + v + '"' : v
  }
  // Gmail reads dates in Pacific time, so widen by a day; the index applies exact bounds after.
  const date = (iso: string, days: number) =>
    new Date(new Date(iso).getTime() + days * 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, '/')
  return [
    query.from && 'from:' + quote(query.from),
    query.to && 'to:' + quote(query.to),
    query.subject && 'subject:' + quote(query.subject),
    query.hasAttachment && 'has:attachment',
    query.unread && 'is:unread',
    query.view === 'starred' && 'is:starred',
    query.after && 'after:' + date(query.after, -1),
    query.before && 'before:' + date(query.before, 1),
    query.text,
  ]
    .filter(Boolean)
    .join(' ')
}
