/** Drop schedules, Reddit posting windows and alert times use US Eastern time. */
export const EASTERN_TZ = 'America/New_York'

/** Calendar and clock parts of an instant in Eastern time (month is 1-based). */
export function getEasternParts(ms: number): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const result: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') {
      result[part.type] = Number(part.value)
    }
  }
  return result
}

/** The instant of Eastern midnight on a calendar date (month is 1-based). */
export function getEasternMidnight(
  year: number,
  month: number,
  day: number
): Date {
  const utcMidnight = Date.UTC(year, month - 1, day)
  const p = getEasternParts(utcMidnight)
  const offsetMs =
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    utcMidnight
  return new Date(utcMidnight - offsetMs)
}
