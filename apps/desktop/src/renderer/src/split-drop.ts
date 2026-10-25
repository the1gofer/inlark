import {
  normalizeSplitValue,
  type Address,
  type Conversation,
  type Split,
  type SplitRule,
} from '@inlark/core'

/** Drag data for a conversation row, so split tabs accept rows and nothing else. */
export const conversationDragType = 'application/x-inlark-conversation'

/**
 * A small card that follows the pointer while a row is dragged, instead of the whole row, which
 * would cover the split tabs it is being dropped on. It sits below and right of the pointer.
 */
export function setConversationDragImage(
  dataTransfer: DataTransfer,
  sender: string,
  subject: string,
) {
  const wrapper = document.createElement('div')
  wrapper.style.cssText =
    'position:fixed;top:-1000px;left:-1000px;padding:14px 0 0 14px;pointer-events:none;'
  const card = document.createElement('div')
  card.style.cssText =
    'max-width:240px;padding:6px 10px;border-radius:8px;font:12px/1.35 system-ui,sans-serif;' +
    'background:var(--surface);color:var(--text);border:1px solid var(--accent-solid);' +
    'box-shadow:0 6px 18px rgb(0 0 0 / 0.3);opacity:0.92;'
  for (const [text, weight] of [
    [sender, '600'],
    [subject, '400'],
  ]) {
    const line = document.createElement('div')
    line.textContent = text
    line.style.cssText = `font-weight:${weight};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
    card.append(line)
  }
  wrapper.append(card)
  document.body.append(wrapper)
  dataTransfer.setDragImage(wrapper, 0, 0)
  // The browser snapshots the image during dragstart, so the element can go right after.
  setTimeout(() => wrapper.remove())
}

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
