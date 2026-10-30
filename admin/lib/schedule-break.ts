import { parseEpisodeNumber } from '@shared/schedule'
import type { ScheduleBreak, ShowSchedule } from '@shared/types'

export const MAX_BREAK_WEEKS = 12

/**
 * The episode a new break goes after: the last dropped one (the checker's
 * saved episode), or the episode before the start when none has aired.
 */
export function getBreakAfterEpisode(
  schedule: ShowSchedule,
  lastEpisodeNumber: string | null | undefined
): number {
  const beforeStart = Math.max(0, schedule.startEpisode - 1)
  const last = lastEpisodeNumber ? parseEpisodeNumber(lastEpisodeNumber) : 0
  return Math.max(beforeStart, Math.floor(last))
}

/**
 * Adds a break, merging it into an existing break after the same episode
 * of the same kind (one added on top of AniList's gap, or not).
 */
export function addScheduleBreak(
  breaks: ScheduleBreak[] | undefined,
  afterEpisode: number,
  weeks: number,
  onTopOfAniList = false
): ScheduleBreak[] {
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_BREAK_WEEKS) {
    throw new Error(`weeks must be a whole number from 1 to ${MAX_BREAK_WEEKS}`)
  }

  const next = (breaks ?? []).map((entry) => ({ ...entry }))
  const existing = next.find(
    (entry) =>
      entry.afterEpisode === afterEpisode &&
      Boolean(entry.onTopOfAniList) === onTopOfAniList
  )
  if (existing) {
    existing.weeks += weeks
  } else {
    next.push({
      afterEpisode,
      weeks,
      ...(onTopOfAniList ? { onTopOfAniList } : {}),
    })
  }
  return next.sort((a, b) => a.afterEpisode - b.afterEpisode)
}

/** "1-week break after episode 8", noting one added on top of AniList's gap. */
export function describeBreak(entry: ScheduleBreak): string {
  const description = `${entry.weeks}-week break after episode ${entry.afterEpisode}`
  return entry.onTopOfAniList
    ? `${description} (on top of AniList)`
    : description
}
