import { replyRecipients, type Address, type Identity, type Message } from '@inlark/core'

/**
 * Recipients for replying to an introduction: the person who made it moves to Bcc, and everyone
 * they introduced you to stays on the reply. Undefined when there is nobody to be introduced to.
 */
export function introRecipients(
  message: Message,
  identities: Identity[],
): { to: Address[]; bcc: Address[]; thanks: string; identity?: Identity } | undefined {
  const { to: introducer, cc: others, identity } = replyRecipients(message, identities, true)
  if (!introducer.length || !others.length) return undefined
  const name = (introducer[0].name || '').trim().split(/\s+/)[0]
  return {
    to: others,
    bcc: introducer,
    identity,
    thanks: 'Thanks' + (name ? ' ' + name : '') + ' (moved to Bcc)!',
  }
}
