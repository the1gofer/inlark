import { describe, expect, it } from 'vitest'
import {
  gmailSearch,
  inView,
  parseSearch,
  searchScope,
  withoutIn,
  withoutTyped,
} from '../packages/core/src'

const now = new Date('2026-10-25T12:00:00Z')

describe('search operators', () => {
  it('pulls operators out of the text and keeps plain words', () => {
    const { search, tokens } = parseSearch(
      'from:karla lunch subject:"team offsite" has:attachment',
      now,
    )
    expect(search).toEqual({
      from: 'karla',
      subject: 'team offsite',
      hasAttachment: true,
      text: 'lunch',
    })
    expect(tokens.map((t) => t.operator)).toEqual(['from', undefined, 'subject', 'has'])
    expect(tokens[2]).toMatchObject({ start: 17, end: 39 })
  })
  it('reads dates, ages and flags', () => {
    expect(
      parseSearch('after:2026/1/5 before:2026-02-01 is:unread is:starred', now).search,
    ).toEqual({
      after: '2026-01-05T00:00:00.000Z',
      before: '2026-02-01T00:00:00.000Z',
      unread: true,
      starred: true,
    })
    expect(parseSearch('newer_than:2d', now).search.after).toBe('2026-10-23T12:00:00.000Z')
  })
  it('searches unknown or meaningless operators as typed', () => {
    const { search, tokens } = parseSearch('has:pizza label:work from: after:soon', now)
    expect(search).toEqual({ text: 'has:pizza label:work from: after:soon' })
    expect(tokens.every((t) => !t.operator)).toBe(true)
  })
  it('builds a Gmail search that widens dates for Gmail’s time zone', () => {
    expect(
      gmailSearch({
        view: 'starred',
        from: 'Karla Smith',
        hasAttachment: true,
        after: '2026-01-05T00:00:00.000Z',
        text: 'lunch',
      }),
    ).toBe('from:"Karla Smith" has:attachment is:starred after:2026/01/04 lunch')
  })
  it('sends the typed search to Gmail as written', () => {
    const search = '"facility advisors" OR from:karla label:board is:unread'
    const typed = parseSearch(search, now).search
    expect(
      gmailSearch({ view: 'all', ...typed, search, searchFields: ['text', 'from', 'unread'] }),
    ).toBe(search)
  })
  it('adds only the filters the search box did not set, grouping the typed search', () => {
    expect(
      gmailSearch({
        view: 'all',
        text: 'lunch OR dinner',
        hasAttachment: true,
        search: 'lunch OR dinner',
        searchFields: ['text'],
      }),
    ).toBe('(lunch OR dinner) has:attachment')
  })
  it('leaves filters set some other way for the index to check', () => {
    expect(
      withoutTyped({
        view: 'starred',
        unread: true,
        after: '2026-01-05T00:00:00.000Z',
        search: 'is:starred is:unread',
        searchFields: ['unread', 'starred'],
      }),
    ).toEqual({ view: 'all', after: '2026-01-05T00:00:00.000Z' })
  })
})

describe('in: folder filter', () => {
  it('is an operator the box highlights', () => {
    const { search, tokens } = parseSearch('in:sent allan', now)
    expect(search).toEqual({ in: 'sent', text: 'allan' })
    expect(tokens[0]).toMatchObject({ operator: 'in', start: 0, end: 7 })
    expect(parseSearch('in:"Board Prep" budget', now).search.in).toBe('Board Prep')
  })
  it('names views the way Gmail does', () => {
    expect(inView('Sent')).toBe('sent')
    expect(inView('spam')).toBe('junk')
    expect(inView('anywhere')).toBe('all')
    expect(inView('Receipts')).toBeUndefined()
  })
  it('starts a search in the folder being viewed', () => {
    expect(searchScope('sent')).toBe('in:sent ')
    expect(searchScope('junk')).toBe('in:spam ')
    expect(searchScope('starred')).toBe('is:starred ')
    expect(searchScope('inbox')).toBe('')
    expect(searchScope('all')).toBe('')
    expect(searchScope('all', 'Board Prep')).toBe('in:"Board Prep" ')
    expect(searchScope('inbox', 'Receipts')).toBe('in:Receipts ')
  })
  it('drops the filter from the words when the folder is searched directly', () => {
    expect(withoutIn('in:sent allan')).toBe('allan')
    expect(withoutIn('from:karla in:"Board Prep" budget')).toBe('from:karla budget')
    expect(withoutIn('allan')).toBe('allan')
  })
})
