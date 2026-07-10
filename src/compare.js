export function getShowState(state, showId) {
  return state.shows?.[showId] ?? null
}

export function isNewEpisode(previousState, latestSnapshot) {
  if (!previousState?.lastEpisodeId) {
    return false
  }

  return previousState.lastEpisodeId !== latestSnapshot.episode.id
}

export function createBaselineState(latestSnapshot, notifiedAt = new Date().toISOString()) {
  return {
    lastEpisodeId: latestSnapshot.episode.id,
    lastEpisodeNumber: String(latestSnapshot.episode.episode ?? ''),
    lastEpisodeTitle: latestSnapshot.episode.title ?? '',
    lastNotifiedAt: notifiedAt,
    seasonId: latestSnapshot.seasonId,
    seasonTitle: latestSnapshot.seasonTitle,
  }
}

export function createUpdatedState(latestSnapshot, notifiedAt = new Date().toISOString()) {
  return createBaselineState(latestSnapshot, notifiedAt)
}

export function getTimingStatus(expectedDropAt, actualDropAt) {
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

export function formatTimingLabel(status, expectedDropAt, actualDropAt) {
  if (status === 'unknown') {
    return expectedDropAt
      ? `Expected ${new Date(expectedDropAt).toLocaleString('en-US', { timeZoneName: 'short' })}`
      : 'No expected drop time set'
  }

  const expected = new Date(expectedDropAt).toLocaleString('en-US', {
    timeZoneName: 'short',
  })
  const actual = new Date(actualDropAt).toLocaleString('en-US', {
    timeZoneName: 'short',
  })

  if (status === 'on-time') return `On time (expected ${expected}, dropped ${actual})`
  if (status === 'early') return `Early (expected ${expected}, dropped ${actual})`
  return `Late (expected ${expected}, dropped ${actual})`
}
