import type { Show, ShowSchedule, StateFile } from './types.js'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
const WINDOW_BEFORE_MS = 5 * 60 * 1000
const WINDOW_AFTER_DENSE_MS = 90 * 60 * 1000
const LATE_POLL_INTERVAL_MS = 30 * 60 * 1000
const CRON_INTERVAL_MS = 5 * 60 * 1000
const WAITING_GRACE_MS = 15 * 60 * 1000
const PTW_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export { WINDOW_BEFORE_MS, WINDOW_AFTER_DENSE_MS, LATE_POLL_INTERVAL_MS }

export function getPremiereBatchSize(schedule: ShowSchedule): number {
  return schedule.premiereBatchSize > 0 ? schedule.premiereBatchSize : 1
}

export function getLastScheduledEpisode(schedule: ShowSchedule): number | null {
  if (schedule.mode === 'ongoing' || schedule.episodeCount === null) {
    return null
  }
  return schedule.startEpisode + schedule.episodeCount - 1
}

export function isEpisodeInSchedule(schedule: ShowSchedule, episodeNumber: number): boolean {
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

export function getNextExpectedEpisode(
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

export function isInDenseCheckWindow(
  expectedAt: Date,
  now: Date = new Date()
): boolean {
  const nowMs = now.getTime()
  const expectedMs = expectedAt.getTime()
  return (
    nowMs >= expectedMs - WINDOW_BEFORE_MS &&
    nowMs <= expectedMs + WINDOW_AFTER_DENSE_MS
  )
}

export function isInLateCheckSlot(
  expectedAt: Date,
  now: Date = new Date()
): boolean {
  const elapsed = now.getTime() - (expectedAt.getTime() + WINDOW_AFTER_DENSE_MS)
  if (elapsed < 0) {
    return false
  }

  return (
    Math.floor(elapsed / LATE_POLL_INTERVAL_MS) !==
    Math.floor((elapsed - CRON_INTERVAL_MS) / LATE_POLL_INTERVAL_MS)
  )
}

export function isInCheckWindow(expectedAt: Date, now: Date = new Date()): boolean {
  return isInDenseCheckWindow(expectedAt, now) || isInLateCheckSlot(expectedAt, now)
}

export function getCheckWindowMode(
  expectedAt: Date,
  now: Date = new Date()
): 'dense' | 'late' | null {
  if (isInDenseCheckWindow(expectedAt, now)) {
    return 'dense'
  }
  if (isInLateCheckSlot(expectedAt, now)) {
    return 'late'
  }
  return null
}

export function isPastWaitingGrace(
  expectedAt: Date,
  now: Date = new Date()
): boolean {
  return now.getTime() > expectedAt.getTime() + WAITING_GRACE_MS
}

export function parseEpisodeNumber(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function showNeedsCheck(
  show: Show,
  state: StateFile,
  now: Date = new Date()
): boolean {
  const previousState = state.shows[show.id] ?? null
  const lastEpisodeNumber = previousState
    ? parseEpisodeNumber(previousState.lastEpisodeNumber)
    : null
  const nextExpectedEp = getNextExpectedEpisode(show.schedule, lastEpisodeNumber)

  if (nextExpectedEp === null) {
    return false
  }

  const expectedAt = getExpectedDropAt(show.schedule, nextExpectedEp)
  if (!expectedAt) {
    return false
  }

  return isInCheckWindow(expectedAt, now)
}

export function anyShowNeedsCheck(
  shows: Show[],
  state: StateFile,
  now: Date = new Date()
): boolean {
  return shows.some((show) => showNeedsCheck(show, state, now))
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
