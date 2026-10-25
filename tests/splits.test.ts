import { describe, it, expect } from 'vitest'
import {
  addressPattern,
  conditionMatches,
  conditionsFor,
  matchesSplitQuery,
  splitConditions,
  splitQuery,
  visibleSplits,
  type Split,
  type SplitCondition,
} from '../packages/core/src'

const person = (email: string, name = '') => ({ name, email })
const mail = (extra: Record<string, unknown> = {}) => ({
  from: [person('ada@example.com', 'Ada Lovelace')],
  to: [person('me@home.org')],
  cc: [],
  subject: 'Quarterly Report',
  accountId: 'a',
  ...extra,
})
const from = (value: string, accountId?: string): SplitCondition => ({
  field: 'from',
  value,
  ...(accountId ? { accountId } : {}),
})

describe('addressPattern', () => {
  it('tells domains, exact addresses and partial text apart', () => {
    expect(addressPattern('@Example.com')).toEqual({ kind: 'domain', value: 'example.com' })
    expect(addressPattern(' Ada@Example.com ')).toEqual({
      kind: 'address',
      value: 'ada@example.com',
    })
    expect(addressPattern('News')).toEqual({ kind: 'contains', value: 'news' })
  })
})

describe('conditionMatches', () => {
  it('matches a domain and its subdomains but not lookalike domains', () => {
    const rule = from('@example.com')
    expect(conditionMatches(mail({ from: [person('a@example.com')] }), rule)).toBe(true)
    expect(conditionMatches(mail({ from: [person('a@mail.example.com')] }), rule)).toBe(true)
    expect(conditionMatches(mail({ from: [person('a@notexample.com')] }), rule)).toBe(false)
    expect(conditionMatches(mail({ from: [person('a@example.com.evil.org')] }), rule)).toBe(false)
  })
  it('matches one exact address regardless of case', () => {
    const rule = from('Ada@Example.com')
    expect(conditionMatches(mail({ from: [person('ADA@example.COM')] }), rule)).toBe(true)
    expect(conditionMatches(mail({ from: [person('xada@example.com')] }), rule)).toBe(false)
    expect(conditionMatches(mail({ from: [person('ada@mail.example.com')] }), rule)).toBe(false)
  })
  it('matches other text in the address or display name', () => {
    expect(conditionMatches(mail(), from('lovelace'))).toBe(true)
    expect(conditionMatches(mail(), from('ADA@'.slice(0, 3)))).toBe(true)
    expect(conditionMatches(mail({ from: [person('news@shop.io')] }), from('news'))).toBe(true)
    expect(conditionMatches(mail(), from('babbage'))).toBe(false)
  })
  it('checks To and Cc for a to rule, and ignores From', () => {
    const rule: SplitCondition = { field: 'to', value: '@team.dev' }
    expect(conditionMatches(mail({ to: [person('x@team.dev')] }), rule)).toBe(true)
    expect(conditionMatches(mail({ cc: [person('x@team.dev')] }), rule)).toBe(true)
    expect(conditionMatches(mail({ from: [person('x@team.dev')] }), rule)).toBe(false)
  })
  it('matches subjects as a case-insensitive substring', () => {
    const rule: SplitCondition = { field: 'subject', value: 'quarterly' }
    expect(conditionMatches(mail(), rule)).toBe(true)
    expect(conditionMatches(mail({ subject: 'Re: QUARTERLY report' }), rule)).toBe(true)
    expect(conditionMatches(mail({ subject: 'Monthly' }), rule)).toBe(false)
  })
  it('ignores surrounding space and never matches an empty value', () => {
    expect(conditionMatches(mail(), from('  @EXAMPLE.com  '))).toBe(true)
    for (const value of ['', '   ', '@'])
      for (const field of ['from', 'to', 'subject'] as const)
        expect(conditionMatches(mail(), { field, value })).toBe(false)
  })
})

describe('split conditions', () => {
  const split: Split = {
    id: 's1',
    name: 'Work',
    accountId: 'a',
    rules: [
      { field: 'from', value: ' @Example.com ' },
      { field: 'subject', value: '   ' },
      { field: 'to', value: '' },
    ],
  }
  it('drops empty rules and tags the split account', () => {
    expect(splitConditions(split)).toEqual([from('@example.com', 'a')])
    expect(splitConditions({ ...split, accountId: undefined })).toEqual([from('@example.com')])
  })
  it('keeps conditions for the account or for every account', () => {
    const conditions = [from('@a.com', 'a'), from('@b.com', 'b'), from('@all.com')]
    expect(conditionsFor(conditions, 'a')).toEqual([from('@a.com', 'a'), from('@all.com')])
    expect(conditionsFor(conditions, 'c')).toEqual([from('@all.com')])
    expect(conditionsFor(undefined, 'a')).toBeUndefined()
  })
  it('lists only splits with something to match that apply to the account', () => {
    const empty: Split = { id: 'e', name: 'Empty', rules: [{ field: 'from', value: ' ' }] }
    const other: Split = { ...split, id: 's2', accountId: 'b' }
    const shared: Split = { ...split, id: 's3', accountId: undefined }
    const all = [split, empty, other, shared]
    expect(visibleSplits(all).map((s) => s.id)).toEqual(['s1', 's2', 's3'])
    expect(visibleSplits(all, 'a').map((s) => s.id)).toEqual(['s1', 's3'])
    expect(visibleSplits(all, 'b').map((s) => s.id)).toEqual(['s2', 's3'])
    expect(visibleSplits(undefined, 'a')).toEqual([])
  })
})

describe('splitQuery', () => {
  const work: Split = { id: 'w', name: 'Work', rules: [{ field: 'from', value: '@work.com' }] }
  const news: Split = { id: 'n', name: 'News', rules: [{ field: 'subject', value: 'digest' }] }
  it('asks for the active split mail only', () => {
    expect(splitQuery([work, news], news)).toEqual({
      matchAny: [{ field: 'subject', value: 'digest' }],
    })
  })
  it('leaves out every split from the main inbox tab', () => {
    expect(splitQuery([work, news], undefined)).toEqual({
      excludeAny: [
        { field: 'from', value: '@work.com' },
        { field: 'subject', value: 'digest' },
      ],
    })
    expect(splitQuery([], undefined)).toEqual({})
  })
})

describe('matchesSplitQuery', () => {
  it('requires a matchAny hit and no excludeAny hit', () => {
    const hit = from('@example.com')
    const miss = from('@other.com')
    expect(matchesSplitQuery(mail(), {})).toBe(true)
    expect(matchesSplitQuery(mail(), { matchAny: [miss, hit] })).toBe(true)
    expect(matchesSplitQuery(mail(), { matchAny: [miss] })).toBe(false)
    expect(matchesSplitQuery(mail(), { matchAny: [] })).toBe(false)
    expect(matchesSplitQuery(mail(), { excludeAny: [hit] })).toBe(false)
    expect(matchesSplitQuery(mail(), { excludeAny: [miss] })).toBe(true)
    expect(matchesSplitQuery(mail(), { matchAny: [hit], excludeAny: [from('lovelace')] })).toBe(
      false,
    )
  })
  it('ignores conditions that belong to other accounts', () => {
    expect(matchesSplitQuery(mail(), { matchAny: [from('@example.com', 'b')] })).toBe(false)
    expect(matchesSplitQuery(mail(), { matchAny: [from('@example.com', 'a')] })).toBe(true)
    expect(matchesSplitQuery(mail(), { excludeAny: [from('@example.com', 'b')] })).toBe(true)
  })
})
