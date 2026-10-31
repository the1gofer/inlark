import { describe, expect, it } from 'vitest'
import { swipeOffset, swipeResult } from '../apps/desktop/src/renderer/src/swipe'

describe('row swiping', () => {
  it('archives on a long enough swipe right and snoozes on a long swipe left', () => {
    expect(swipeResult(130, 390, true, true)).toBe('right')
    expect(swipeResult(-130, 390, true, true)).toBe('left')
  })

  it('springs back from a short swipe', () => {
    expect(swipeResult(80, 390, true, true)).toBeUndefined()
    expect(swipeResult(-80, 390, true, true)).toBeUndefined()
  })

  it('never acts on a side without an action', () => {
    expect(swipeResult(300, 390, true, false)).toBeUndefined()
    expect(swipeResult(-300, 390, false, true)).toBeUndefined()
  })

  it('caps the distance on wide screens so a swipe stays short', () => {
    expect(swipeResult(125, 1200, true, true)).toBe('right')
  })

  it('barely moves a row toward a side with no action', () => {
    expect(swipeOffset(200, true, false)).toBe(24)
    expect(swipeOffset(-30, false, true)).toBe(-5)
    expect(swipeOffset(-200, true, false)).toBe(-200)
  })
})
