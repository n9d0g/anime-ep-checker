import type { EpisodeSnapshot, Show } from './types.js'

const OFFSET_BUFFER_MS = 24 * 60 * 60 * 1000

export function resolveEpisodeOffset(
  show: Show,
  snapshot: EpisodeSnapshot
): number | null {
  const startMs = new Date(show.schedule.startAt).getTime()
  if (Number.isNaN(startMs)) {
    return 0
  }

  const thresholdMs = startMs - OFFSET_BUFFER_MS
  const startEpisode = show.schedule.startEpisode
  const seasonEpisodes = snapshot.seasonEpisodes ?? []

  if (seasonEpisodes.length === 0) {
    const providerEpisode = Number(snapshot.episode.episode ?? '')
    if (!Number.isFinite(providerEpisode)) {
      return 0
    }

    const availableAt = snapshot.episode.availableAt
    const availableMs = availableAt ? new Date(availableAt).getTime() : null
    const isCandidate =
      availableMs === null ||
      Number.isNaN(availableMs) ||
      availableMs >= thresholdMs

    if (!isCandidate) {
      return null
    }

    return Math.max(0, providerEpisode - startEpisode)
  }

  const candidates = seasonEpisodes.filter((entry) => {
    if (!entry.available) {
      return true
    }
    if (!entry.availableAt) {
      return true
    }
    const availableMs = new Date(entry.availableAt).getTime()
    if (Number.isNaN(availableMs)) {
      return true
    }
    return availableMs >= thresholdMs
  })

  if (candidates.length === 0) {
    return null
  }

  const minEpisode = Math.min(...candidates.map((entry) => entry.episode))
  return Math.max(0, minEpisode - startEpisode)
}

export function toRelativeSnapshot(
  snapshot: EpisodeSnapshot,
  offset: number
): EpisodeSnapshot {
  const providerEpisode = Number(snapshot.episode.episode ?? '')
  const relativeEpisode = Number.isFinite(providerEpisode)
    ? providerEpisode - offset
    : snapshot.episode.episode

  return {
    ...snapshot,
    episode: {
      ...snapshot.episode,
      episode: relativeEpisode,
    },
    seasonEpisodes: snapshot.seasonEpisodes?.map((entry) => ({
      ...entry,
      episode: entry.episode - offset,
    })),
  }
}
