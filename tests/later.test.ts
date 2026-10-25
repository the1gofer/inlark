import { describe, expect, it } from 'vitest'
import { laterChoices, localInputValue } from '../apps/desktop/src/renderer/src/later'

describe('later choices', () => {
  it('offers the evening, tomorrow, the weekend and next week on a weekday morning', () => {
    const tuesday = new Date(2026, 9, 27, 9, 30)
    const choices = Object.fromEntries(laterChoices(tuesday).map((c) => [c.id, c.at]))
    expect(choices.evening).toEqual(new Date(2026, 9, 27, 18))
    expect(choices.tomorrow).toEqual(new Date(2026, 9, 28, 8))
    expect(choices.weekend).toEqual(new Date(2026, 9, 31, 9))
    expect(choices.week).toEqual(new Date(2026, 10, 2, 8))
  })
  it('leaves out choices that no longer make sense', () => {
    const fridayNight = new Date(2026, 9, 30, 21)
    const ids = laterChoices(fridayNight).map((c) => c.id)
    expect(ids).not.toContain('evening')
    expect(ids).not.toContain('weekend')
    // On Sunday, next week starts tomorrow morning, so it isn't offered twice.
    const sunday = new Date(2026, 10, 1, 10)
    expect(laterChoices(sunday).map((c) => c.id)).toEqual(['hour', 'evening', 'tomorrow'])
  })
  it('formats a local time for the date and time field', () => {
    expect(localInputValue(new Date(2026, 0, 5, 7, 4))).toBe('2026-01-05T07:04')
  })
})
