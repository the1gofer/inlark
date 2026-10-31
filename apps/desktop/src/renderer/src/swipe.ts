import { useRef, useState, type TouchEvent } from 'react'

export type SwipeSide = 'left' | 'right'

/** How far a row must travel, as a share of its width, before letting go acts on it. */
export const swipeThreshold = 0.3
/** Movement before the gesture decides between scrolling the list and swiping the row. */
const lockDistance = 10

/** Where a dragged row ends up: a side with no action barely moves, so it feels anchored. */
export function swipeOffset(dx: number, canLeft: boolean, canRight: boolean) {
  if ((dx > 0 && !canRight) || (dx < 0 && !canLeft))
    return Math.sign(dx) * Math.min(24, Math.abs(dx) / 6)
  return dx
}

/** The action a released swipe triggers, if it went far enough on a side that has one. */
export function swipeResult(
  dx: number,
  width: number,
  canLeft: boolean,
  canRight: boolean,
): SwipeSide | undefined {
  if (Math.abs(dx) < Math.min(120, width * swipeThreshold)) return
  if (dx > 0 && canRight) return 'right'
  if (dx < 0 && canLeft) return 'left'
}

/**
 * Superhuman style swiping for list rows on touchscreens: drag a row sideways and let go past the
 * threshold to act on it. Vertical drags are left to the list so it still scrolls normally.
 * The row moves by setting its transform directly, which keeps the drag smooth on long lists.
 */
export function useSwipe({
  onLeft,
  onRight,
}: {
  /** Swiping toward the left edge. The row springs back, since the action may be canceled. */
  onLeft?: () => void
  /** Swiping toward the right edge. The row slides away before the action runs. */
  onRight?: () => void
}) {
  const slider = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number; axis?: 'x' | 'y'; dx: number } | undefined>(
    undefined,
  )
  const reset = useRef<number>(undefined)
  // Set once a swipe moves the row, so the tap that ends it doesn't also open the conversation.
  const swiped = useRef(false)
  const [side, setSide] = useState<SwipeSide>()
  const [armed, setArmed] = useState(false)
  const canLeft = !!onLeft,
    canRight = !!onRight

  const place = (dx: number, animate: boolean) => {
    const el = slider.current
    if (!el) return
    el.style.transition = animate ? 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
    el.style.transform = dx ? `translate3d(${dx}px, 0, 0)` : ''
  }
  const settle = () => {
    place(0, true)
    setArmed(false)
    window.setTimeout(() => setSide(undefined), 180)
  }

  return {
    slider,
    side,
    armed,
    /** Whether the last touch was a swipe; reading it clears it. */
    consumeSwipe: () => {
      const was = swiped.current
      swiped.current = false
      return was
    },
    handlers: {
      onTouchStart: (event: TouchEvent) => {
        if (event.touches.length !== 1 || (!canLeft && !canRight)) return
        clearTimeout(reset.current)
        swiped.current = false
        const touch = event.touches[0]
        start.current = { x: touch.clientX, y: touch.clientY, dx: 0 }
      },
      onTouchMove: (event: TouchEvent) => {
        const s = start.current
        if (!s || event.touches.length !== 1) return
        const touch = event.touches[0]
        const dx = touch.clientX - s.x,
          dy = touch.clientY - s.y
        if (!s.axis) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < lockDistance) return
          s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
        }
        if (s.axis !== 'x') return
        swiped.current = true
        s.dx = swipeOffset(dx, canLeft, canRight)
        place(s.dx, false)
        const nextSide = s.dx > 0 ? 'right' : s.dx < 0 ? 'left' : undefined
        setSide(nextSide)
        const width = slider.current?.offsetWidth || window.innerWidth
        const nextArmed = !!swipeResult(s.dx, width, canLeft, canRight)
        setArmed((was) => {
          if (nextArmed && !was) navigator.vibrate?.(8)
          return nextArmed
        })
      },
      onTouchEnd: () => {
        const s = start.current
        start.current = undefined
        if (!s || s.axis !== 'x') return
        const width = slider.current?.offsetWidth || window.innerWidth
        const result = swipeResult(s.dx, width, canLeft, canRight)
        if (result === 'right') {
          place(width, true)
          window.setTimeout(() => onRight?.(), 160)
          // The list drops the row once the action starts. If it is still here, put it back.
          reset.current = window.setTimeout(settle, 1200)
        } else {
          settle()
          if (result === 'left') onLeft?.()
        }
      },
      onTouchCancel: () => {
        start.current = undefined
        settle()
      },
    },
  }
}
