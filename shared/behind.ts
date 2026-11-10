// Behind: a Watching show whose MAL watched progress is short of its latest
// episode snapshot. The App badge counts these shows.

function toEpisodeNumber(
  value: number | string | null | undefined
): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const episode = Number(value)
  return Number.isFinite(episode) ? episode : null
}

/** Watched on MAL is short of the latest episode snapshot. Unknown either side is not behind. */
export function isBehind(
  watched: number | null | undefined,
  latestEpisode: number | string | null | undefined
): boolean {
  const latest = toEpisodeNumber(latestEpisode)
  return (
    typeof watched === 'number' &&
    Number.isFinite(watched) &&
    latest !== null &&
    watched < latest
  )
}

/** How many of the Watching shows are behind: the App badge's number. */
export function countBehindShows(
  showIds: readonly string[],
  latestEpisodeByShowId: Record<string, number | string | null | undefined>,
  watchedByShowId: Record<string, number | null | undefined>
): number {
  return showIds.filter((showId) =>
    isBehind(watchedByShowId[showId], latestEpisodeByShowId[showId])
  ).length
}
