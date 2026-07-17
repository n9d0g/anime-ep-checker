import type { Show, ShowSchedule, StateFile } from './types.js'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
const WINDOW_BEFORE_MS = 10 * 60 * 1000
const WAITING_GRACE_MS = 15 * 60 * 1000

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

export function isInCheckWindow(expectedAt: Date, now: Date = new Date()): boolean {
  const nowMs = now.getTime()
  const start = expectedAt.getTime() - WINDOW_BEFORE_MS
  return nowMs >= start
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
