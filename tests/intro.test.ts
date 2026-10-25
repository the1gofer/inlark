import { describe, expect, it } from 'vitest'
import { introRecipients } from '../apps/desktop/src/renderer/src/intro'
import type { Message } from '../packages/core/src'

const message = (to: string[], cc: string[] = []): Message => ({
  id: 'm',
  threadId: 't',
  accountId: 'a',
  subject: 'Intro: Sam <> Alex',
  from: [{ name: 'Jordan Lee', email: 'jordan@example.com' }],
  to: to.map((email) => ({ name: '', email })),
  cc: cc.map((email) => ({ name: '', email })),
  bcc: [],
  replyTo: [],
  receivedAt: '2026-10-01T10:00:00Z',
  preview: '',
  keywords: {},
  mailboxIds: {},
  size: 1,
  hasAttachment: false,
})
const me = [{ id: 'i', accountId: 'a', name: 'Me', email: 'me@example.com' }]

describe('instant intro', () => {
  it('moves the introducer to Bcc and keeps everyone else', () => {
    expect(introRecipients(message(['me@example.com', 'alex@example.com']), me)).toMatchObject({
      to: [{ email: 'alex@example.com' }],
      bcc: [{ email: 'jordan@example.com' }],
      thanks: 'Thanks Jordan (moved to Bcc)!',
    })
  })
  it('does nothing when nobody else was introduced', () => {
    expect(introRecipients(message(['me@example.com']), me)).toBeUndefined()
  })
})
