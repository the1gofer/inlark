import { describe, expect, it } from 'vitest'
import type { Conversation, Split } from '@inlark/core'
import { ruleOptions, withRule } from '../apps/desktop/src/renderer/src/split-drop'

const conversation = {
  subject: 'Re: Fwd: Annual meeting',
  from: [{ name: 'Jason', email: 'jason@example.com' }],
  messages: [
    {
      from: [{ name: 'Lakeview HOA Board', email: 'Board@LakeviewHOA.org' }],
      to: [{ name: '', email: 'hoa@example.com' }],
      cc: [],
    },
    {
      from: [{ name: 'Jason', email: 'jason@example.com' }],
      to: [{ name: '', email: 'board@lakeviewhoa.org' }],
      cc: [],
    },
  ],
} as unknown as Conversation

describe('adding a conversation to a split', () => {
  it('offers the latest sender other than you, their domain, and an alias it went to', () => {
    const own = new Set(['jason@example.com', 'hoa@example.com'])
    expect(ruleOptions(conversation, own)).toEqual({
      sender: { name: 'Lakeview HOA Board', email: 'Board@LakeviewHOA.org' },
      domain: 'lakeviewhoa.org',
      defaults: {
        from: 'board@lakeviewhoa.org',
        to: 'hoa@example.com',
        subject: 'Annual meeting',
      },
    })
  })

  it('adds a rule once, replacing the blank rule a new split starts with', () => {
    const split: Split = { id: 's', name: 'HOA', rules: [{ field: 'from', value: '' }] }
    const once = withRule(split, { field: 'from', value: ' @lakeviewhoa.org ' })
    expect(once.rules).toEqual([{ field: 'from', value: '@lakeviewhoa.org' }])
    expect(withRule(once, { field: 'from', value: '@LakeviewHOA.org' })).toBe(once)
    expect(withRule(once, { field: 'subject', value: 'meeting' }).rules).toHaveLength(2)
  })
})
