import type { Address, Conversation, SplitRule } from '@inlark/core'

export interface RuleSuggestion {
  /** What the rule field is set to when picked: an address, or `@domain`. */
  value: string
  label: string
  detail?: string
}

export interface KnownAddress {
  address: Address
  count: number
}

/** The addresses a rule field can match in these conversations, most frequent first. */
export function knownAddresses(
  conversations: Conversation[],
  field: SplitRule['field'],
): KnownAddress[] {
  const seen = new Map<string, KnownAddress>()
  for (const c of conversations)
    for (const m of c.messages)
      for (const address of field === 'from' ? m.from : [...m.to, ...m.cc]) {
        const key = address.email.toLowerCase()
        if (!key.includes('@')) continue
        const entry = seen.get(key)
        if (entry) {
          entry.count++
          if (!entry.address.name && address.name) entry.address = address
        } else seen.set(key, { address, count: 1 })
      }
  return [...seen.values()].sort((a, b) => b.count - a.count)
}

const domainOf = (email: string) => email.slice(email.lastIndexOf('@') + 1).toLowerCase()

/**
 * Addresses and whole domains matching what has been typed into a rule. Typing `@` asks for a
 * domain, so only domains are offered then; otherwise people come first.
 */
export function ruleSuggestions(
  known: KnownAddress[],
  typed: string,
  exclude: Set<string> = new Set(),
  limit = 7,
): RuleSuggestion[] {
  const query = typed.trim().toLowerCase()
  const bare = query.replace(/^@/, '')
  if (!bare) return []
  const wantsDomain = query.startsWith('@')
  const addresses: RuleSuggestion[] = []
  const domains = new Map<string, number>()
  for (const { address, count } of known) {
    const email = address.email.toLowerCase()
    if (exclude.has(email)) continue
    const domain = domainOf(email)
    if (domain.includes(bare)) domains.set(domain, (domains.get(domain) || 0) + count)
    const name = (address.name || '').toLowerCase()
    if (
      !wantsDomain &&
      email !== query &&
      (email.includes(bare) || name.split(/\s+/).some((word) => word.startsWith(bare)))
    )
      addresses.push({
        value: email,
        label: address.name || email,
        detail: address.name ? email : undefined,
      })
  }
  const domainSuggestions = [...domains]
    .filter(([domain]) => '@' + domain !== query)
    .sort((a, b) => b[1] - a[1])
    .map(([domain]) => ({
      value: '@' + domain,
      label: '@' + domain,
      detail: 'Everyone at ' + domain,
    }))
  if (wantsDomain) return domainSuggestions.slice(0, limit)
  const people = addresses.slice(0, Math.max(limit - Math.min(2, domainSuggestions.length), 0))
  return [...people, ...domainSuggestions.slice(0, limit - people.length)]
}
