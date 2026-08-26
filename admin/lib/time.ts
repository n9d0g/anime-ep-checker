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

export function toDatetimeLocalValue(isoValue: string | null | undefined): string {
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

export function formatEasternTime(
  isoOrDate: string | Date | null | undefined
): string {
  if (!isoOrDate) return 'Unknown time'

  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(date.getTime())) return 'Invalid date'

  return date.toLocaleString('en-US', {
    timeZone: EASTERN_TZ,
    timeZoneName: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
