import { getShowsFile, saveShowsFile } from './github'
import { resolveMalIdFromSearch, type MalSearchResult } from './mal-match'
import { fetchMalAnimeTitle, searchMalAnime } from './mal'
import type { Show } from './types'

export interface SyncMalResult {
  changed: boolean
  resolvedIds: string[]
  updatedTitles: string[]
}

async function resolveMissingMalId(show: Show): Promise<number | null> {
  if (show.malId || !show.title.trim()) {
    return null
  }

  let results: MalSearchResult[]
  try {
    results = await searchMalAnime(show.title.trim())
  } catch {
    return null
  }

  return resolveMalIdFromSearch(show.title, results)
}

export async function syncShowsWithMal(): Promise<SyncMalResult> {
  const { content, sha } = await getShowsFile()
  const shows = (content.shows ?? []) as Show[]
  const resolvedIds: string[] = []
  const updatedTitles: string[] = []
  let changed = false

  const nextShows = [...shows]

  for (let index = 0; index < nextShows.length; index += 1) {
    const show = { ...nextShows[index] }
    let showChanged = false

    if (!show.malId) {
      const resolved = await resolveMissingMalId(show)
      if (resolved) {
        show.malId = resolved
        showChanged = true
        resolvedIds.push(show.id || show.title)
      }
    }

    if (show.malId) {
      try {
        const malTitle = await fetchMalAnimeTitle(show.malId)
        if (malTitle && malTitle !== show.title) {
          show.title = malTitle
          showChanged = true
          updatedTitles.push(show.id || malTitle)
        }
      } catch {
        // Skip title sync when MAL lookup fails for a single show.
      }
    }

    if (showChanged) {
      nextShows[index] = show
      changed = true
    }
  }

  if (changed) {
    await saveShowsFile(
      nextShows,
      sha,
      'chore: 🧹 sync MAL IDs and titles from admin'
    )
  }

  return { changed, resolvedIds, updatedTitles }
}
