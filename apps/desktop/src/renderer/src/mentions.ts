import { Node, mergeAttributes, type Editor } from '@tiptap/react'
import type { Address, Conversation } from '@inlark/core'

const same = (a: Address, b: Address) => a.email.toLowerCase() === b.email.toLowerCase()

/**
 * Contacts whose name starts a word with `query`, or whose address starts with it. Longer queries
 * also match anywhere, so "smith@" or "ann lee" still find someone. An empty query lists the
 * people you hear from most.
 */
export function matchAddresses(
  suggestions: Address[],
  query: string,
  exclude: Address[] = [],
  limit = 6,
): Address[] {
  const q = query.trim().toLowerCase()
  return suggestions
    .filter(
      (a) =>
        !exclude.some((c) => same(c, a)) &&
        (!q ||
          (a.name || '')
            .toLowerCase()
            .split(/\s+/)
            .some((word) => word.startsWith(q)) ||
          a.email.toLowerCase().startsWith(q) ||
          (q.length > 2 && ((a.name || '') + ' ' + a.email).toLowerCase().includes(q))),
    )
    .slice(0, limit)
}

/** Everyone in these conversations, people you hear from most first, never your own addresses. */
export function rankContacts(conversations: Conversation[], own: Set<string>): Address[] {
  const seen = new Map<string, { address: Address; count: number }>()
  for (const c of conversations)
    for (const m of c.messages)
      for (const address of [...m.from, ...m.to, ...m.cc]) {
        const key = address.email.toLowerCase()
        if (!key || own.has(key)) continue
        const entry = seen.get(key)
        if (entry) {
          entry.count++
          if (!entry.address.name && address.name) entry.address = address
        } else seen.set(key, { address, count: 1 })
      }
  return [...seen.values()].sort((a, b) => b.count - a.count).map((entry) => entry.address)
}

/** `known` followed by anyone in `more` it doesn't already have. */
export function mergeContacts(known: Address[], more: Address[]): Address[] {
  const emails = new Set(known.map((a) => a.email.toLowerCase()))
  return [...known, ...more.filter((a) => !emails.has(a.email.toLowerCase()))]
}

/**
 * An @mention of a person. It's sent as a mailto link reading "@Name", the way Outlook and Gmail
 * write them, so it stays meaningful in any mail app.
 */
export const MentionNode = Node.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  addAttributes() {
    return {
      email: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-mention') ||
          decodeURIComponent((element.getAttribute('href') || '').replace(/^mailto:/i, '')),
        renderHTML: () => ({}),
      },
      label: {
        default: '',
        parseHTML: (element) => (element.textContent || '').replace(/^@/, ''),
        renderHTML: () => ({}),
      },
    }
  },
  parseHTML() {
    // Ahead of the link mark, which would otherwise claim the same element.
    return [{ tag: 'a[data-mention]', priority: 100 }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        href: 'mailto:' + node.attrs.email,
        'data-mention': node.attrs.email,
        class: 'mention',
        style: 'color:#0b57d0;text-decoration:none',
      }),
      '@' + node.attrs.label,
    ]
  },
  renderText: ({ node }) => '@' + node.attrs.label,
})

/** How a mention reads in the message: the contact's name, or their mailbox when unnamed. */
export const mentionLabel = (address: Address) =>
  (address.name || '').trim() || address.email.split('@')[0]

export interface MentionQuery {
  /** Where the "@" starts, and where the cursor is: the range a chosen mention replaces. */
  from: number
  to: number
  query: string
}

/**
 * The "@name" being typed just before the cursor, if any. "@" only starts a mention at the start
 * of a line or after a space or bracket, so email addresses typed into the body are left alone.
 * One space is allowed, for a first and last name.
 */
export function mentionQuery(state: Editor['state']): MentionQuery | undefined {
  const { selection } = state
  if (!selection.empty) return undefined
  const $from = selection.$from
  if (!$from.parent.isTextblock || $from.parent.type.spec.code) return undefined
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const match = /(?:^|[\s(\[])@([^\s@\ufffc]{0,40}(?: [^\s@\ufffc]{0,40})?)$/.exec(before)
  if (!match) return undefined
  const query = match[1]
  return { from: $from.pos - query.length - 1, to: $from.pos, query }
}
