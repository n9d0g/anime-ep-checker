import {
  getShowsFile,
  getStateFile,
  isGithubConflictError,
  saveShowsFile,
  saveStateFileRetrying,
} from './github'
import type { OnHoldSnapshotEntry, StateFile } from './types'
import { resolveMalIdFromSearch, type MalSearchResult } from './mal-match'
import { fetchMalAnimeTitles, searchMalAnime } from './mal'
import type { Show } from './types'

export interface MalShowUpdate {
  id: string
  malId?: number
  title: string
  titleEnglish?: string
}

export interface SyncMalResult {
  changed: boolean
  resolvedIds: string[]
  updatedTitles: string[]
  updatedEnglish: string[]
  shows: Show[]
}

export interface SyncOnHoldEnglishResult {
  changed: boolean
  updatedShowIds: string[]
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
): {
  shows: Show[]
  resolvedIds: string[]
  updatedTitles: string[]
  updatedEnglish: string[]
} {
  const updatesById = new Map(
    updates.filter((update) => update.id).map((update) => [update.id, update])
  )
  const resolvedIds: string[] = []
  const updatedTitles: string[] = []
  const updatedEnglish: string[] = []

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

    if (update.titleEnglish !== undefined) {
      const nextEnglish = update.titleEnglish || undefined
      if (nextEnglish !== show.titleEnglish) {
        next.titleEnglish = nextEnglish
        updatedEnglish.push(show.id || show.title)
      }
    }

    return next
  })

  return { shows, resolvedIds, updatedTitles, updatedEnglish }
}

function englishTitleNeedsSync(show: Show): boolean {
  return Boolean(show.malId) && !show.titleEnglish?.trim()
}

export async function syncOnHoldEnglishTitles(): Promise<SyncOnHoldEnglishResult> {
  const { content } = await getStateFile()
  const state = content as StateFile
  const onHold = state.meta?.onHold
  const entries = onHold?.entries ?? []

  const targets = entries.filter((entry) => englishTitleNeedsSync(entry.show))
  if (targets.length === 0) {
    return { changed: false, updatedShowIds: [] }
  }

  const titlesByMalId = new Map(
    await Promise.all(
      targets.map(async (entry) => {
        const malId = entry.show.malId!
        try {
          const malTitles = await fetchMalAnimeTitles(malId)
          return [malId, malTitles.titleEnglish?.trim() || ''] as const
        } catch {
          return [malId, ''] as const
        }
      })
    )
  )

  const updatedShowIds: string[] = []
  const nextEntries: OnHoldSnapshotEntry[] = entries.map((entry) => {
    const malId = entry.show.malId
    if (!malId) {
      return entry
    }

    const titleEnglish = titlesByMalId.get(malId)
    if (!titleEnglish || entry.show.titleEnglish === titleEnglish) {
      return entry
    }

    updatedShowIds.push(entry.show.id)
    return {
      ...entry,
      show: {
        ...entry.show,
        titleEnglish,
      },
    }
  })

  if (updatedShowIds.length === 0) {
    return { changed: false, updatedShowIds: [] }
  }

  const nextState: StateFile = {
    ...state,
    meta: {
      ...state.meta,
      onHold: {
        ...onHold!,
        entries: nextEntries,
      },
    },
  }

  await saveStateFileRetrying(
    nextState,
    'chore: 🧹 sync English titles for on-hold shows from admin'
  )

  return { changed: true, updatedShowIds }
}

async function collectMalUpdates(shows: Show[]): Promise<MalShowUpdate[]> {
  return Promise.all(
    shows.map(async (show) => {
      const next: MalShowUpdate = {
        id: show.id,
        malId: show.malId,
        title: show.title,
        titleEnglish: show.titleEnglish,
      }

      if (!next.malId) {
        const resolved = await resolveMissingMalId(show)
        if (resolved) {
          next.malId = resolved
        }
      }

      if (next.malId) {
        try {
          const malTitles = await fetchMalAnimeTitles(next.malId)
          if (malTitles.title) {
            next.title = malTitles.title
          }
          if (malTitles.titleEnglish) {
            next.titleEnglish = malTitles.titleEnglish
          }
        } catch {
          // Skip title sync when MAL lookup fails for a single show.
        }
      }

      return next
    })
  )
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
    initialMerge.updatedTitles.length === 0 &&
    initialMerge.updatedEnglish.length === 0
  ) {
    return {
      changed: false,
      resolvedIds: [],
      updatedTitles: [],
      updatedEnglish: [],
      shows: initialShows,
    }
  }

  let latest = await getShowsFile()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latestShows = withDefaultProvider(
      (latest.content.shows ?? []) as Show[]
    )
    const merged = applyMalUpdatesToShows(latestShows, updates)

    if (
      merged.resolvedIds.length === 0 &&
      merged.updatedTitles.length === 0 &&
      merged.updatedEnglish.length === 0
    ) {
      return {
        changed: false,
        resolvedIds: [],
        updatedTitles: [],
        updatedEnglish: [],
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
        updatedEnglish: merged.updatedEnglish,
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
