import type { Show, ShowSchedule } from './types'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

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

export function parseEpisodeNumber(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
