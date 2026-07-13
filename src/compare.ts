import type { EpisodeSnapshot, ShowState, StateFile, TimingStatus } from './types.js'
import { formatEasternTime } from './time.js'

export function getShowState(
  state: StateFile,
  showId: string
): ShowState | null {
  return state.shows[showId] ?? null
}

export function createBaselineState(
  latestSnapshot: EpisodeSnapshot,
  notifiedAt = new Date().toISOString()
): ShowState {
  return {
    lastEpisodeId: latestSnapshot.episode.id,
    lastEpisodeNumber: String(latestSnapshot.episode.episode ?? ''),
    lastEpisodeTitle: latestSnapshot.episode.title ?? '',
    lastNotifiedAt: notifiedAt,
    seasonId: latestSnapshot.seasonId,
    seasonTitle: latestSnapshot.seasonTitle,
    waitingNotifiedForEpisode: null,
  }
}

export function createUpdatedState(
  latestSnapshot: EpisodeSnapshot,
  episodeNumber: number,
  notifiedAt = new Date().toISOString()
): ShowState {
  return {
    lastEpisodeId: latestSnapshot.episode.id,
    lastEpisodeNumber: String(episodeNumber),
    lastEpisodeTitle: latestSnapshot.episode.title ?? '',
    lastNotifiedAt: notifiedAt,
    seasonId: latestSnapshot.seasonId,
    seasonTitle: latestSnapshot.seasonTitle,
    waitingNotifiedForEpisode: null,
  }
}

export function getTimingStatus(
  expectedDropAt: string | null | undefined,
  actualDropAt: string | null | undefined
): TimingStatus {
  if (!expectedDropAt || !actualDropAt) {
    return 'unknown'
  }

  const expected = new Date(expectedDropAt).getTime()
  const actual = new Date(actualDropAt).getTime()
  const diffMinutes = Math.round((actual - expected) / 60_000)

  if (Math.abs(diffMinutes) <= 5) return 'on-time'
  if (diffMinutes < 0) return 'early'
  return 'late'
}

export function formatTimingLabel(
  status: TimingStatus,
  expectedDropAt: string | null | undefined,
  actualDropAt: string | null | undefined
): string {
  if (status === 'unknown') {
    return expectedDropAt
      ? `Expected ${formatEasternTime(expectedDropAt)}`
      : 'No expected drop time set'
  }

  const expected = formatEasternTime(expectedDropAt)
  const actual = formatEasternTime(actualDropAt)

  if (status === 'on-time') {
    return `On time (expected ${expected}, dropped ${actual})`
  }
  if (status === 'early') {
    return `Early (expected ${expected}, dropped ${actual})`
  }
  return `Late (expected ${expected}, dropped ${actual})`
}
