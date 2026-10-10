/** MAL broadcast slot; times are in JST. */
export interface MalBroadcast {
  dayOfWeek: string | null
  startTime: string | null
}

/**
 * Streaming platforms usually publish the subbed episode about an hour after
 * the Japanese broadcast, so scheduled drops sit this far after MAL's slot.
 */
export const RELEASE_BUFFER_MS = 60 * 60 * 1000

const JST_OFFSET_MS = 9 * 60 * 60 * 1000

const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

export function normalizeBroadcastTime(time: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) {
    return null
  }

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) {
    return null
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * Moves `startAt` to MAL's broadcast weekday/time plus the release buffer,
 * staying within the same week so manual delays are kept. Returns null when
 * MAL has no usable broadcast slot.
 */
export function alignStartAtToBroadcast(
  startAt: string,
  broadcast: MalBroadcast | null | undefined
): string | null {
  const weekday = WEEKDAYS.indexOf(
    broadcast?.dayOfWeek?.trim().toLowerCase() ?? ''
  )
  const time = broadcast?.startTime
    ? normalizeBroadcastTime(broadcast.startTime)
    : null
  const current = new Date(startAt).getTime()
  if (weekday < 0 || !time || Number.isNaN(current)) {
    return null
  }

  // Search the 7 JST days centred on the current broadcast (drop minus
  // buffer); exactly one of them falls on MAL's weekday.
  const reference = new Date(current - RELEASE_BUFFER_MS + JST_OFFSET_MS)
  const [hour, minute] = time.split(':').map(Number)

  for (let offset = -3; offset <= 3; offset += 1) {
    const jstDay = Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate() + offset
    )
    if (new Date(jstDay).getUTCDay() !== weekday) {
      continue
    }

    const broadcastAt =
      jstDay + (hour * 60 + minute) * 60 * 1000 - JST_OFFSET_MS
    return new Date(broadcastAt + RELEASE_BUFFER_MS).toISOString()
  }

  return null
}
