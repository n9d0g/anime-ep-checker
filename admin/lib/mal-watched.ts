import { fetchMalAnimeDetails, isMalOutageError } from './mal'
import type { Show } from '@shared/types'

export interface WatchedProgress {
  /** MAL watched episodes per show; null without a MAL link or on a failed lookup. */
  watchedByShowId: Record<string, number | null>
  malDown: boolean
}

/** Each Watching show's MAL progress, one MAL request per linked show. */
export async function fetchWatchedByShowId(
  shows: Pick<Show, 'id' | 'malId'>[],
  fetchDetails: (
    malId: number
  ) => Promise<{ watched: number }> = fetchMalAnimeDetails
): Promise<WatchedProgress> {
  const watchedByShowId: Record<string, number | null> = {}
  let malDown = false

  await Promise.all(
    shows.map(async (show) => {
      if (!show.malId) {
        watchedByShowId[show.id] = null
        return
      }

      try {
        const details = await fetchDetails(show.malId)
        watchedByShowId[show.id] = details.watched
      } catch (error) {
        watchedByShowId[show.id] = null
        if (isMalOutageError(error)) {
          malDown = true
        }
      }
    })
  )

  return { watchedByShowId, malDown }
}
