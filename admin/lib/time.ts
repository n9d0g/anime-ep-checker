const JST_TZ = 'Asia/Tokyo'
const EASTERN_TZ = 'America/New_York'

const DATETIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

function getJstParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00'

  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  }
}

export function toDatetimeLocalValue(
  isoValue: string | null | undefined
): string {
  if (!isoValue) return ''

  if (DATETIME_LOCAL_PATTERN.test(isoValue)) {
    return isoValue
  }

  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return ''

  const { year, month, day, hour, minute } = getJstParts(date)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return null

  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+09:00`
  const result = new Date(iso)
  if (Number.isNaN(result.getTime())) return null
  return result.toISOString()
}

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const WEEK_MS = 7 * DAY_MS

function toDate(isoOrDate: string | Date): Date | null {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  return Number.isNaN(date.getTime()) ? null : date
}

function yearIn(date: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(date)
  )
}

/** "Nov 6", or "Nov 6, 2025" outside the current year. */
function formatDay(date: Date, now: Date, timeZone: string): string {
  const sameYear = yearIn(date, timeZone) === yearIn(now, timeZone)
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date)
}

/** "10:00 AM ET" */
function formatEasternClock(date: Date): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
  return `${time} ET`
}

/** "in 2d", "in 5h", "35m ago": whole units, rounded down, at least 1m. */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diff = date.getTime() - now.getTime()
  const abs = Math.abs(diff)
  const amount =
    abs < HOUR_MS
      ? `${Math.max(1, Math.floor(abs / MINUTE_MS))}m`
      : abs < DAY_MS
        ? `${Math.floor(abs / HOUR_MS)}h`
        : `${Math.floor(abs / DAY_MS)}d`
  return diff >= 0 ? `in ${amount}` : `${amount} ago`
}

/** An Eastern calendar day: "Nov 6", or "Nov 6, 2025" outside this year. */
export function formatShortDate(
  isoOrDate: string | Date | null | undefined,
  now: Date = new Date()
): string | null {
  const date = isoOrDate ? toDate(isoOrDate) : null
  return date ? formatDay(date, now, EASTERN_TZ) : null
}

/** A UTC calendar day, for date-only values like MAL's: "Nov 6". */
export function formatCalendarDate(date: Date, now: Date = new Date()): string {
  return formatDay(date, now, 'UTC')
}

/** An absolute Eastern time: "Oct 2, 11:00 AM ET". */
export function formatEasternDateTime(
  isoOrDate: string | Date | null | undefined,
  now: Date = new Date()
): string | null {
  const date = isoOrDate ? toDate(isoOrDate) : null
  return date
    ? `${formatDay(date, now, EASTERN_TZ)}, ${formatEasternClock(date)}`
    : null
}

/**
 * When a drop is (or was): within a week it's relative with the Eastern day
 * and time, "in 2d · Fri 10:00 AM ET"; further out, just the day, "Nov 6".
 */
export function formatDropTime(
  isoOrDate: string | Date,
  now: Date = new Date()
): string | null {
  const date = toDate(isoOrDate)
  if (!date) return null
  if (Math.abs(date.getTime() - now.getTime()) >= WEEK_MS) {
    return formatDay(date, now, EASTERN_TZ)
  }
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    weekday: 'short',
  }).format(date)
  return `${formatRelative(date, now)} · ${weekday} ${formatEasternClock(date)}`
}

/** "updated 3h ago", or "updated just now" within the minute. */
export function formatUpdatedAgo(
  isoOrDate: string | Date | null | undefined,
  now: Date = new Date()
): string | null {
  const date = isoOrDate ? toDate(isoOrDate) : null
  if (!date) return null
  return now.getTime() - date.getTime() < MINUTE_MS
    ? 'updated just now'
    : `updated ${formatRelative(date, now)}`
}
