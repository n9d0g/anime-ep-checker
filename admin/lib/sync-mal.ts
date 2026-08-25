import { getShowsFile, isGithubConflictError, saveShowsFile } from './github'
import { resolveMalIdFromSearch, type MalSearchResult } from './mal-match'
import { fetchMalAnimeTitle, searchMalAnime } from './mal'
import type { Show } from './types'

export interface MalShowUpdate {
  id: string
  malId?: number
  title: string
}

export interface SyncMalResult {
  changed: boolean
  resolvedIds: string[]
  updatedTitles: string[]
  shows: Show[]
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

export function applyMalUpdatesToShows(
  currentShows: Show[],
  updates: MalShowUpdate[]
): { shows: Show[]; resolvedIds: string[]; updatedTitles: string[] } {
  const updatesById = new Map(
    updates.filter((update) => update.id).map((update) => [update.id, update])
  )
  const resolvedIds: string[] = []
  const updatedTitles: string[] = []

  const shows = currentShows.map((show) => {
    const update = updatesById.get(show.id)
    if (!update) {
      return show
    }

    const next = { ...show }

    if (update.malId && update.malId !== show.malId) {
      next.malId = update.malId
      resolvedIds.push(show.id || show.title)
    }

    if (update.title && update.title !== show.title) {
      next.title = update.title
      updatedTitles.push(show.id || update.title)
    }

    return next
  })

  return { shows, resolvedIds, updatedTitles }
}

async function collectMalUpdates(shows: Show[]): Promise<MalShowUpdate[]> {
  const updates: MalShowUpdate[] = []

  for (const show of shows) {
    const next: MalShowUpdate = {
      id: show.id,
      malId: show.malId,
      title: show.title,
    }

    if (!next.malId) {
      const resolved = await resolveMissingMalId(show)
      if (resolved) {
        next.malId = resolved
      }
    }

    if (next.malId) {
      try {
        const malTitle = await fetchMalAnimeTitle(next.malId)
        if (malTitle) {
          next.title = malTitle
        }
      } catch {
        // Skip title sync when MAL lookup fails for a single show.
      }
    }

    updates.push(next)
  }

  return updates
}

function withDefaultProvider(shows: Show[]): Show[] {
  return shows.map((show) => ({
    ...show,
    provider: show.provider ?? 'crunchyroll',
  }))
}

export async function syncShowsWithMal(): Promise<SyncMalResult> {
  const initial = await getShowsFile()
  const initialShows = withDefaultProvider(
    (initial.content.shows ?? []) as Show[]
  )
  const updates = await collectMalUpdates(initialShows)
  const initialMerge = applyMalUpdatesToShows(initialShows, updates)

  if (
    initialMerge.resolvedIds.length === 0 &&
    initialMerge.updatedTitles.length === 0
  ) {
    return {
      changed: false,
      resolvedIds: [],
      updatedTitles: [],
      shows: initialShows,
    }
  }

  let latest = await getShowsFile()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latestShows = withDefaultProvider(
      (latest.content.shows ?? []) as Show[]
    )
    const merged = applyMalUpdatesToShows(latestShows, updates)

    if (merged.resolvedIds.length === 0 && merged.updatedTitles.length === 0) {
      return {
        changed: false,
        resolvedIds: [],
        updatedTitles: [],
        shows: latestShows,
      }
    }

    try {
      await saveShowsFile(
        merged.shows,
        latest.sha,
        'chore: 🧹 sync MAL IDs and titles from admin'
      )
      return {
        changed: true,
        resolvedIds: merged.resolvedIds,
        updatedTitles: merged.updatedTitles,
        shows: merged.shows,
      }
    } catch (error) {
      if (!isGithubConflictError(error) || attempt === 2) {
        throw error
      }
      latest = await getShowsFile()
    }
  }

  throw new Error('Failed to sync MAL data after concurrent updates')
}
