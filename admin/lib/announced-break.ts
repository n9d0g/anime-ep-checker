import { getExpectedDropAt } from '@shared/schedule'
import type {
  AiringSchedule,
  AnnouncedBreak,
  ScheduleBreak,
  ShowSchedule,
} from '@shared/types'
import { MAX_BREAK_WEEKS } from './schedule-break'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** The Japanese calendar day of an instant, as UTC midnight milliseconds. */
function japanDayMs(date: Date): number {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS)
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  )
}

/**
 * The break to add for a pending announced break: after the episode before
 * the postponed one, for the shift rounded to the nearest week. Null for a
 * TBA, a shift under a week (a one-off time change, not a break) or one
 * longer than a break can be.
 */
export function getAnnouncedBreakSuggestion(
  schedule: ShowSchedule,
  announced: AnnouncedBreak | null | undefined,
  airingSchedule?: AiringSchedule | null
): ScheduleBreak | null {
  if (announced?.status !== 'pending' || !announced.newDate) {
    return null
  }
  const expectedAt = getExpectedDropAt(
    schedule,
    announced.episode,
    airingSchedule
  )
  const newDayMs = Date.parse(`${announced.newDate}T00:00:00Z`)
  if (!expectedAt || Number.isNaN(newDayMs)) {
    return null
  }

  const days = Math.round((newDayMs - japanDayMs(expectedAt)) / MS_PER_DAY)
  if (days < 7) {
    return null
  }
  const weeks = Math.round(days / 7)
  if (weeks > MAX_BREAK_WEEKS) {
    return null
  }
  return { afterEpisode: announced.episode - 1, weeks }
}
