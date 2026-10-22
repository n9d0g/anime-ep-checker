import type { Show, ShowSchedule, StateFile } from './types.ts'
import { EASTERN_TZ } from './time-zone.ts'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
const DROP_WINDOW_BEFORE_MS = 5 * 60 * 1000
const DROP_WINDOW_AFTER_MS = 90 * 60 * 1000
const LATE_SLOT_INTERVAL_MS = 30 * 60 * 1000
const CRON_INTERVAL_MS = 5 * 60 * 1000
const WAITING_GRACE_MS = 15 * 60 * 1000
const PTW_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

function getPremiereBatchSize(schedule: ShowSchedule): number {
  return schedule.premiereBatchSize > 0 ? schedule.premiereBatchSize : 1
}

export function getLastScheduledEpisode(schedule: ShowSchedule): number | null {
  if (schedule.mode === 'ongoing' || schedule.episodeCount === null) {
    return null
  }
  return schedule.startEpisode + schedule.episodeCount - 1
}

export function isEpisodeInSchedule(
  schedule: ShowSchedule,
  episodeNumber: number
): boolean {
  if (episodeNumber < schedule.startEpisode) {
    return false
  }

  const lastEpisode = getLastScheduledEpisode(schedule)
  if (lastEpisode !== null && episodeNumber > lastEpisode) {
    return false
  }

  return true
}

export function getExpectedDropAt(
  schedule: ShowSchedule,
  episodeNumber: number
): Date | null {
  if (!isEpisodeInSchedule(schedule, episodeNumber)) {
    return null
  }

  const start = new Date(schedule.startAt)
  if (Number.isNaN(start.getTime())) {
    return null
  }

  const batchSize = getPremiereBatchSize(schedule)
  const batchEnd = schedule.startEpisode + batchSize - 1

  if (episodeNumber <= batchEnd) {
    return start
  }

  const weeksAfterBatch = episodeNumber - batchEnd
  return new Date(start.getTime() + weeksAfterBatch * MS_PER_WEEK)
}

function getNextExpectedEpisode(
  schedule: ShowSchedule,
  lastEpisodeNumber: number | null
): number | null {
  const next =
    lastEpisodeNumber === null ? schedule.startEpisode : lastEpisodeNumber + 1

  if (!isEpisodeInSchedule(schedule, next)) {
    return null
  }

  return next
}

/** The episode expected next and when it should drop. */
export interface NextDrop {
  episode: number
  /** Null when the schedule's start time is not a valid date. */
  expectedAt: Date | null
}

/**
 * The next drop after the last recorded episode (a stored or parsed episode
 * number; null or undefined before the first episode), or null once the
 * schedule has no more episodes.
 */
export function getNextDrop(
  schedule: ShowSchedule,
  lastEpisodeNumber: string | number | null | undefined
): NextDrop | null {
  const last =
    lastEpisodeNumber === null || lastEpisodeNumber === undefined
      ? null
      : parseEpisodeNumber(lastEpisodeNumber)
  const episode = getNextExpectedEpisode(schedule, last)
  if (episode === null) {
    return null
  }
  return { episode, expectedAt: getExpectedDropAt(schedule, episode) }
}

/** From 5 minutes before the expected drop to 90 minutes after. */
function isInDropWindow(expectedAt: Date, now: Date): boolean {
  const nowMs = now.getTime()
  const expectedMs = expectedAt.getTime()
  return (
    nowMs >= expectedMs - DROP_WINDOW_BEFORE_MS &&
    nowMs <= expectedMs + DROP_WINDOW_AFTER_MS
  )
}

/** A 30-minute late slot after the drop window, matched to the 5-minute cron. */
function isInLateSlot(expectedAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - (expectedAt.getTime() + DROP_WINDOW_AFTER_MS)
  if (elapsed < 0) {
    return false
  }

  return (
    Math.floor(elapsed / LATE_SLOT_INTERVAL_MS) !==
    Math.floor((elapsed - CRON_INTERVAL_MS) / LATE_SLOT_INTERVAL_MS)
  )
}

export type DropWindowMode = 'drop_window' | 'late_slot'

/** Whether `now` is in the drop window or a late slot for this drop. */
export function getDropWindowMode(
  expectedAt: Date,
  now: Date = new Date()
): DropWindowMode | null {
  if (isInDropWindow(expectedAt, now)) {
    return 'drop_window'
  }
  if (isInLateSlot(expectedAt, now)) {
    return 'late_slot'
  }
  return null
}

export function isInDropWindowOrLateSlot(
  expectedAt: Date,
  now: Date = new Date()
): boolean {
  return getDropWindowMode(expectedAt, now) !== null
}

export function isPastWaitingGrace(
  expectedAt: Date,
  now: Date = new Date()
): boolean {
  return now.getTime() > expectedAt.getTime() + WAITING_GRACE_MS
}

/** Episode number from a stored or provider value; 0 when missing or not numeric. */
export function parseEpisodeNumber(
  value: string | number | null | undefined
): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function needsPlanToWatchCheck(
  state: StateFile,
  now: Date = new Date()
): boolean {
  const checkedAt = state.meta?.planToWatchCheckedAt
  if (!checkedAt) {
    return true
  }

  const checkedMs = new Date(checkedAt).getTime()
  if (Number.isNaN(checkedMs)) {
    return true
  }

  return now.getTime() - checkedMs >= PTW_CHECK_INTERVAL_MS
}

export function hasOrphanedShows(shows: Show[], state: StateFile): boolean {
  const activeIds = new Set(shows.map((show) => show.id))

  for (const showId of Object.keys(state.shows)) {
    if (!activeIds.has(showId)) {
      return true
    }
  }

  const messageIds = state.meta?.watchingDashboardMessageIds ?? {}
  for (const showId of Object.keys(messageIds)) {
    if (!activeIds.has(showId)) {
      return true
    }
  }

  return false
}

function getEasternDateKey(date: Date): { key: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date)
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return {
    key: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday'),
  }
}

/** Weekly on Sundays (Eastern), once per Sunday, to stay light on MAL. */
export function needsRelatedAnimeCheck(
  state: StateFile,
  now: Date = new Date()
): boolean {
  const today = getEasternDateKey(now)
  if (today.weekday !== 'Sun') {
    return false
  }

  const checkedAt = state.meta?.relatedAnimeCheckedAt
  if (!checkedAt) {
    return true
  }

  const checked = new Date(checkedAt)
  if (Number.isNaN(checked.getTime())) {
    return true
  }

  return getEasternDateKey(checked).key !== today.key
}
