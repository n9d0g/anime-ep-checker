export const EASTERN_TZ = 'America/New_York'

function getEasternParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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

  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return ''

  const { year, month, day, hour, minute } = getEasternParts(date)
  const pad = (value: number) => String(value).padStart(2, '0')

  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`
}

export function fromDatetimeLocalValue(value: string): string | null {
  if (!value) return null

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])

  let utc = Date.UTC(year, month - 1, day, hour, minute)

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const eastern = getEasternParts(new Date(utc))
    const targetMs = Date.UTC(year, month - 1, day, hour, minute)
    const actualMs = Date.UTC(
      eastern.year,
      eastern.month - 1,
      eastern.day,
      eastern.hour,
      eastern.minute
    )
    const diff = targetMs - actualMs
    if (diff === 0) break
    utc += diff
  }

  const result = new Date(utc)
  if (Number.isNaN(result.getTime())) return null
  return result.toISOString()
}
