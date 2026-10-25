/** A suggested time for sending later, snoozing, or a reminder. */
export interface LaterChoice {
  id: string
  label: string
  at: Date
}

const at = (base: Date, days: number, hour: number) => {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

/**
 * Times that suit email: later today, tomorrow morning, the weekend and next week, in the
 * user's own time zone. Choices that would land in the past or repeat another are left out.
 */
export function laterChoices(now = new Date()): LaterChoice[] {
  const weekday = now.getDay()
  const choices: LaterChoice[] = [
    { id: 'hour', label: 'In an hour', at: new Date(now.getTime() + 60 * 60_000) },
  ]
  if (now.getHours() < 17)
    choices.push({ id: 'evening', label: 'This evening', at: at(now, 0, 18) })
  choices.push({ id: 'tomorrow', label: 'Tomorrow morning', at: at(now, 1, 8) })
  // Saturday morning, unless it's already the weekend or tomorrow is Saturday.
  if (weekday >= 1 && weekday <= 4)
    choices.push({ id: 'weekend', label: 'This weekend', at: at(now, 6 - weekday, 9) })
  choices.push({ id: 'week', label: 'Next week', at: at(now, (8 - weekday) % 7 || 7, 8) })
  const seen = new Set<number>()
  return choices.filter((c) => {
    const time = c.at.getTime()
    if (time <= now.getTime() || seen.has(time)) return false
    seen.add(time)
    return true
  })
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

/** “6:00 PM”, “Tomorrow 8:00 AM”, “Sat 9:00 AM” or “Mon, Nov 3 8:00 AM”. */
export function laterLabel(value: Date | string, now = new Date()): string {
  const d = new Date(value)
  const time = timeFormat.format(d)
  const days = Math.round((at(d, 0, 0).getTime() - at(now, 0, 0).getTime()) / 86_400_000)
  if (days === 0) return time
  if (days === 1) return 'Tomorrow ' + time
  if (days > 1 && days < 7) return dayFormat.format(d) + ' ' + time
  return dateFormat.format(d) + ' ' + time
}

/** The value for an `<input type="datetime-local">`, in local time. */
export function localInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  )
}
