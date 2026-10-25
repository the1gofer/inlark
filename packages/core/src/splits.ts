import type { Address, MailQuery, Message, Split, SplitCondition } from './model'

// Not crypto.randomUUID, which browsers withhold from pages served over plain HTTP.
export const newSplitId = () => 'split-' + Math.random().toString(36).slice(2, 10)

/** A first split for one sender, named after them and matching their address. */
export function splitForSender(sender: Address, accountId?: string): Split {
  return {
    id: newSplitId(),
    name: sender.name.trim() || sender.email,
    ...(accountId ? { accountId } : {}),
    rules: [{ field: 'from', value: sender.email.toLowerCase() }],
  }
}

/** Rule values are compared without case or surrounding space. */
export function normalizeSplitValue(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * How an address rule matches: `@example.com` is a domain and its subdomains, `a@example.com`
 * one exact address, and anything else part of a name or address (such as `newsletter`).
 */
export function addressPattern(value: string): {
  kind: 'domain' | 'address' | 'contains'
  value: string
} {
  const v = normalizeSplitValue(value)
  if (v.startsWith('@')) return { kind: 'domain', value: v.slice(1) }
  if (v.includes('@')) return { kind: 'address', value: v }
  return { kind: 'contains', value: v }
}

function addressMatches(addresses: Address[], value: string): boolean {
  const pattern = addressPattern(value)
  if (!pattern.value) return false
  return addresses.some((a) => {
    const email = a.email.toLowerCase()
    if (pattern.kind === 'domain')
      return email.endsWith('@' + pattern.value) || email.endsWith('.' + pattern.value)
    if (pattern.kind === 'address') return email === pattern.value
    return email.includes(pattern.value) || a.name.toLowerCase().includes(pattern.value)
  })
}

export function conditionMatches(
  message: Pick<Message, 'from' | 'to' | 'cc' | 'subject'>,
  condition: SplitCondition,
): boolean {
  if (condition.field === 'from') return addressMatches(message.from, condition.value)
  if (condition.field === 'to')
    return addressMatches([...message.to, ...message.cc], condition.value)
  const v = normalizeSplitValue(condition.value)
  return !!v && message.subject.toLowerCase().includes(v)
}

/** The conditions of a split that has something to match, tagged with its account. */
export function splitConditions(split: Split): SplitCondition[] {
  return split.rules
    .filter((rule) => normalizeSplitValue(rule.value))
    .map((rule) => ({
      field: rule.field,
      value: normalizeSplitValue(rule.value),
      ...(split.accountId ? { accountId: split.accountId } : {}),
    }))
}

/** Splits that apply while looking at one account, or every account when none is chosen. */
export function visibleSplits(splits: Split[] | undefined, accountId?: string): Split[] {
  return (splits || []).filter(
    (s) => splitConditions(s).length && (!accountId || !s.accountId || s.accountId === accountId),
  )
}

/**
 * The inbox query for a split tab. With a split, only its mail; without one, the rest of the
 * inbox, leaving out mail any visible split has claimed.
 */
export function splitQuery(splits: Split[], active: Split | undefined): Partial<MailQuery> {
  if (active) return { matchAny: splitConditions(active) }
  const excluded = splits.flatMap(splitConditions)
  return excluded.length ? { excludeAny: excluded } : {}
}

/** Conditions that apply to one account; the rest belong to splits for other accounts. */
export function conditionsFor(
  conditions: SplitCondition[] | undefined,
  accountId: string,
): SplitCondition[] | undefined {
  return conditions?.filter((c) => !c.accountId || c.accountId === accountId)
}

/** Whether a message belongs in a query's split, for providers that filter in memory. */
export function matchesSplitQuery(
  message: Pick<Message, 'from' | 'to' | 'cc' | 'subject' | 'accountId'>,
  query: Pick<MailQuery, 'matchAny' | 'excludeAny'>,
): boolean {
  const matchAny = conditionsFor(query.matchAny, message.accountId)
  const excludeAny = conditionsFor(query.excludeAny, message.accountId)
  if (matchAny && !matchAny.some((c) => conditionMatches(message, c))) return false
  if (excludeAny?.some((c) => conditionMatches(message, c))) return false
  return true
}
