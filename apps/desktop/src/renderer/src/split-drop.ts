import {
  normalizeSplitValue,
  type Address,
  type Conversation,
  type Split,
  type SplitRule,
} from '@inlark/core'

/** Drag data for a conversation row, so split tabs accept rows and nothing else. */
export const conversationDragType = 'application/x-inlark-conversation'

export type RuleChoice = 'sender' | 'domain' | 'other'

/** Who a conversation is from, skipping your own replies, and the rules it suggests. */
export function ruleOptions(
  conversation: Pick<Conversation, 'subject' | 'from' | 'messages'>,
  own: Set<string>,
) {
  const messages = [...conversation.messages].reverse()
  const sender: Address | undefined =
    messages.flatMap((m) => m.from).find((a) => !own.has(a.email.toLowerCase())) ||
    conversation.from[0]
  const email = sender?.email.toLowerCase() || ''
  const domain = email.includes('@') ? email.slice(email.lastIndexOf('@') + 1) : ''
  // An alias it was sent to is the likeliest “other” rule; otherwise any recipient.
  const recipients = messages.flatMap((m) => [...m.to, ...m.cc])
  const recipient = recipients.find((a) => own.has(a.email.toLowerCase())) || recipients[0]
  return {
    sender,
    domain,
    defaults: {
      from: email,
      to: recipient?.email.toLowerCase() || '',
      subject: conversation.subject.replace(/^((re|fwd?|aw|sv)\s*:\s*)+/i, '').trim(),
    } satisfies Record<SplitRule['field'], string>,
  }
}

/** The split with one more rule, unless it already has that rule. */
export function withRule(split: Split, rule: SplitRule): Split {
  const value = normalizeSplitValue(rule.value)
  if (split.rules.some((r) => r.field === rule.field && normalizeSplitValue(r.value) === value))
    return split
  // A new split starts with one empty rule; fill it rather than keep a blank row.
  const rules = split.rules.filter((r) => normalizeSplitValue(r.value))
  return { ...split, rules: [...rules, { field: rule.field, value: rule.value.trim() }] }
}
