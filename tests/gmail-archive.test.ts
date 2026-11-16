import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Account, ImapConnectionConfig } from '../packages/core/src'
import { ImapProvider } from '../packages/imap/src'
import { openInProcessIndex } from '../apps/desktop/src/main/imap-index/sqlite-index'
import { planMutation } from '../apps/desktop/src/main/mail-mutations'
import { FakeImapServer } from './support/fake-imap'

const config: ImapConnectionConfig = {
  protocol: 'imap',
  email: 'me@example.com',
  incoming: { host: 'imap.example.com', port: 993, security: 'tls', username: 'me' },
  outgoing: { host: 'smtp.example.com', port: 465, security: 'tls', username: 'me' },
  outgoingSameCredentials: true,
}
let directory: string
let server: FakeImapServer
let p: ImapProvider
let account: Account

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'inlark-gmail-'))
  server = new FakeImapServer()
  server.capabilities.add('X-GM-EXT-1')
  server.boxes.delete('Archive')
  server.addMailbox('[Gmail]/All Mail', '\\All')
  const input = {
    emailId: '42',
    messageId: 'b@x',
    subject: 'Summary',
    date: new Date().toISOString(),
    text: 'hi',
  }
  for (const path of ['INBOX', '[Gmail]/All Mail']) server.deliver(path, input)
  p = new ImapProvider({
    connectionId: 'c1',
    name: 'Gmail',
    config,
    password: 'disposable',
    index: openInProcessIndex(join(directory, 'index.sqlite')),
    readAttachment: async () => new Uint8Array(),
    background: false,
    ports: server.port,
    timing: { sentCopyGraceMs: 0, initialBatch: 5, historicalBatch: 5, previews: 0 },
    folders: { archive: { path: '[Gmail]/All Mail' } },
  })
  ;[account] = await p.connect()
  await (p as any).syncPass('all')
})
afterEach(async () => {
  await p.close()
  await rm(directory, { recursive: true, force: true })
})

async function archive(threadId: string) {
  const plan = planMutation(
    await p.conversationMetadata(account, [threadId]),
    await p.mailboxes(account),
    'archive',
    undefined,
    { exclusiveMailboxes: true },
  )
  return { plan, result: await p.update(account, plan.changes, []) }
}

describe('Gmail archive', () => {
  it('takes the message out of the Inbox instead of moving it into All Mail', async () => {
    const [conversation] = (await p.query(account, { view: 'inbox' })).items
    const move = vi.spyOn(server.commandPorts[0], 'move')
    const { result } = await archive(conversation.id)
    expect(result.failures).toEqual([])
    expect(result.updated).toHaveLength(1)
    expect(move).not.toHaveBeenCalled()
    expect(server.box('INBOX').messages).toHaveLength(0)
    expect(server.box('[Gmail]/All Mail').messages).toHaveLength(1)
    // The archived message keeps its ID, now on its All Mail copy.
    const [moved] = await p.messages(account, result.updated)
    const allMail = (await p.mailboxes(account)).find((b) => b.role === 'archive')!.id
    expect(moved.mailboxIds).toEqual({ [allMail]: true })
    expect((await p.query(account, { view: 'inbox' })).items).toHaveLength(0)
  })
  it('undoes an archive by copying back to the Inbox, never expunging from All Mail', async () => {
    const [conversation] = (await p.query(account, { view: 'inbox' })).items
    const { plan } = await archive(conversation.id)
    const expunge = vi.spyOn(server.commandPorts[0], 'expunge')
    const result = await p.update(account, plan.inverse, [])
    expect(result.failures).toEqual([])
    expect(expunge).not.toHaveBeenCalled()
    expect(server.box('INBOX').messages).toHaveLength(1)
    expect(server.box('[Gmail]/All Mail').messages).toHaveLength(1)
  })
})
