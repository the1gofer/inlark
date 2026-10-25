import { describe, expect, it } from 'vitest'
import type { Address, Conversation } from '@inlark/core'
import { knownAddresses, ruleSuggestions } from '../apps/desktop/src/renderer/src/split-suggestions'

const conversation = (from: Address[], to: Address[] = [], cc: Address[] = []) =>
  ({ messages: [{ from, to, cc }] }) as unknown as Conversation

const github = { name: 'GitHub', email: 'notifications@github.com' }
const gist = { name: '', email: 'noreply@gist.github.com' }
const board = { name: 'Lakeview HOA Board', email: 'board@lakeviewhoa.org' }
const me = { name: 'Jason', email: 'jason@example.com' }

describe('split rule suggestions', () => {
  const inbox = [
    conversation([github], [me]),
    conversation([github], [me]),
    conversation([gist], [me]),
    conversation([board], [{ name: '', email: 'hoa@example.com' }], [me]),
  ]

  it('counts senders, or recipients and Cc for To rules', () => {
    expect(knownAddresses(inbox, 'from').map((k) => [k.address.email, k.count])).toEqual([
      ['notifications@github.com', 2],
      ['noreply@gist.github.com', 1],
      ['board@lakeviewhoa.org', 1],
    ])
    expect(knownAddresses(inbox, 'to').map((k) => k.address.email)).toEqual([
      'jason@example.com',
      'hoa@example.com',
    ])
  })

  it('offers people by name or address, then their domains', () => {
    const known = knownAddresses(inbox, 'from')
    expect(ruleSuggestions(known, 'lake').map((s) => s.value)).toEqual([
      'board@lakeviewhoa.org',
      '@lakeviewhoa.org',
    ])
    expect(ruleSuggestions(known, 'git').map((s) => s.value)).toEqual([
      'notifications@github.com',
      'noreply@gist.github.com',
      '@github.com',
      '@gist.github.com',
    ])
  })

  it('offers only domains after @, busiest first', () => {
    const known = knownAddresses(inbox, 'from')
    expect(ruleSuggestions(known, '@git')).toEqual([
      { value: '@github.com', label: '@github.com', detail: 'Everyone at github.com' },
      {
        value: '@gist.github.com',
        label: '@gist.github.com',
        detail: 'Everyone at gist.github.com',
      },
    ])
  })

  it('leaves out excluded addresses, what is already typed, and empty input', () => {
    const known = knownAddresses(inbox, 'to')
    expect(ruleSuggestions(known, 'example', new Set(['jason@example.com']))).toEqual([
      { value: 'hoa@example.com', label: 'hoa@example.com', detail: undefined },
      { value: '@example.com', label: '@example.com', detail: 'Everyone at example.com' },
    ])
    expect(ruleSuggestions(known, '@example.com')).toEqual([])
    expect(ruleSuggestions(known, '  @ ')).toEqual([])
  })
})
