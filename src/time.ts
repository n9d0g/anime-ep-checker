const EASTERN_TZ = 'America/New_York'

export function formatEasternTime(isoOrDate: string | Date | null | undefined): string {
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
    second: '2-digit',
  })
}
