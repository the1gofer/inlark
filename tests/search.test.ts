import { describe, expect, it } from 'vitest'
import { gmailSearch, parseSearch } from '../packages/core/src'

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
})
