import { getShowsFile, getStateFile, updateRepoFiles } from './github'
import { alignStartAtToBroadcast, type MalBroadcast } from './broadcast'
import type { StateFile } from './types'
import { resolveMalIdFromSearch, type MalSearchResult } from './mal-match'
import {
  fetchMalAnimeInfo,
  fetchMalAnimeTitles,
  isMalOutageError,
  searchMalAnime,
} from './mal'
import type { Show } from './types'

interface MalShowUpdate {
  id: string
  malId?: number
  title: string
  titleEnglish?: string
  /** MAL's episode total; only present when MAL reports one. */
  episodeCount?: number
  /** MAL's weekly JST broadcast slot; only present when MAL reports one. */
  broadcast?: MalBroadcast
}

interface SyncMalResult {
  changed: boolean
  resolvedIds: string[]
  updatedTitles: string[]
  updatedEnglish: string[]
  updatedEpisodeCounts: string[]
  updatedStartTimes: string[]
  shows: Show[]
  /** shows.json version that `shows` came from. */
  showsVersion: string | null
  watchedByShowId: Record<string, number | null>
  malDown: boolean
}

interface SyncOnHoldEnglishResult {
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
  updatedEpisodeCounts: string[]
  updatedStartTimes: string[]
} {
  const updatesById = new Map(
    updates.filter((update) => update.id).map((update) => [update.id, update])
  )
  const resolvedIds: string[] = []
  const updatedTitles: string[] = []
  const updatedEnglish: string[] = []
  const updatedEpisodeCounts: string[] = []
  const updatedStartTimes: string[] = []

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

    // Counts are often guessed (or left ongoing) before MAL lists a total;
    // once it does, MAL wins. The schedule ends at
    // startEpisode + episodeCount - 1, so align that with MAL's last episode.
    if (update.episodeCount) {
      const episodeCount = update.episodeCount - show.schedule.startEpisode + 1
      if (
        episodeCount >= 1 &&
        (show.schedule.mode !== 'finite' ||
          episodeCount !== show.schedule.episodeCount)
      ) {
        next.schedule = { ...show.schedule, mode: 'finite', episodeCount }
        updatedEpisodeCounts.push(show.id || show.title)
      }
    }

    const startAt = alignStartAtToBroadcast(
      next.schedule.startAt,
      update.broadcast
    )
    if (
      startAt &&
      new Date(startAt).getTime() !== new Date(next.schedule.startAt).getTime()
    ) {
      next.schedule = { ...next.schedule, startAt }
      updatedStartTimes.push(show.id || show.title)
    }

    return next
  })

  return {
    shows,
    resolvedIds,
    updatedTitles,
    updatedEnglish,
    updatedEpisodeCounts,
    updatedStartTimes,
  }
}

function hasMalChanges(merge: {
  resolvedIds: string[]
  updatedTitles: string[]
  updatedEnglish: string[]
  updatedEpisodeCounts: string[]
  updatedStartTimes: string[]
}): boolean {
  return (
    merge.resolvedIds.length > 0 ||
    merge.updatedTitles.length > 0 ||
    merge.updatedEnglish.length > 0 ||
    merge.updatedEpisodeCounts.length > 0 ||
    merge.updatedStartTimes.length > 0
  )
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

  let updatedShowIds: string[] = []
  const { committed: changed } = await updateRepoFiles(
    ['state.json'],
    ({ 'state.json': latest }) => {
      updatedShowIds = []
      const latestOnHold = latest.meta?.onHold
      if (!latestOnHold) return null

      const nextEntries = latestOnHold.entries.map((entry) => {
        const malId = entry.show.malId
        const titleEnglish = malId ? titlesByMalId.get(malId) : undefined
        if (!titleEnglish || entry.show.titleEnglish === titleEnglish) {
          return entry
        }

        updatedShowIds.push(entry.show.id)
        return { ...entry, show: { ...entry.show, titleEnglish } }
      })
      if (updatedShowIds.length === 0) return null

      latest.meta = {
        ...latest.meta,
        onHold: { ...latestOnHold, entries: nextEntries },
      }
      return { 'state.json': latest }
    },
    'chore: 🧹 sync English titles for on-hold shows from admin'
  )

  return changed
    ? { changed: true, updatedShowIds }
    : { changed: false, updatedShowIds: [] }
}

interface MalCollected {
  updates: MalShowUpdate[]
  /** Episodes watched on MAL per show ID (null when unknown). */
  watchedByShowId: Record<string, number | null>
  malDown: boolean
}

/** One MAL anime request per show, for both sync updates and watched counts. */
async function collectMalUpdates(shows: Show[]): Promise<MalCollected> {
  const watchedByShowId: Record<string, number | null> = {}
  let malDown = false

  const updates = await Promise.all(
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

      watchedByShowId[show.id] = null
      if (next.malId) {
        try {
          const malTitles = await fetchMalAnimeInfo(next.malId)
          watchedByShowId[show.id] = malTitles.watched
          if (malTitles.title) {
            next.title = malTitles.title
          }
          if (malTitles.titleEnglish) {
            next.titleEnglish = malTitles.titleEnglish
          }
          if (malTitles.numEpisodes) {
            next.episodeCount = malTitles.numEpisodes
          }
          if (malTitles.broadcast) {
            next.broadcast = malTitles.broadcast
          }
        } catch (error) {
          // Skip title sync when MAL lookup fails for a single show.
          if (isMalOutageError(error)) malDown = true
        }
      }

      return next
    })
  )

  return { updates, watchedByShowId, malDown }
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
  const { updates, watchedByShowId, malDown } =
    await collectMalUpdates(initialShows)
  const initialMerge = applyMalUpdatesToShows(initialShows, updates)

  if (!hasMalChanges(initialMerge)) {
    return {
      changed: false,
      resolvedIds: [],
      updatedTitles: [],
      updatedEnglish: [],
      updatedEpisodeCounts: [],
      updatedStartTimes: [],
      shows: initialShows,
      showsVersion: initial.sha,
      watchedByShowId,
      malDown,
    }
  }

  let merged = initialMerge
  const { committed: changed, versions } = await updateRepoFiles(
    ['shows.json'],
    ({ 'shows.json': latest }) => {
      merged = applyMalUpdatesToShows(
        withDefaultProvider(latest.shows ?? []),
        updates
      )
      if (!hasMalChanges(merged)) return null
      return { 'shows.json': { ...latest, shows: merged.shows } }
    },
    'chore: 🧹 sync MAL IDs, titles, episode counts, and release times from admin'
  )

  if (!changed) {
    return {
      changed: false,
      resolvedIds: [],
      updatedTitles: [],
      updatedEnglish: [],
      updatedEpisodeCounts: [],
      updatedStartTimes: [],
      shows: merged.shows,
      showsVersion: versions['shows.json'],
      watchedByShowId,
      malDown,
    }
  }

  return {
    changed: true,
    resolvedIds: merged.resolvedIds,
    updatedTitles: merged.updatedTitles,
    updatedEnglish: merged.updatedEnglish,
    updatedEpisodeCounts: merged.updatedEpisodeCounts,
    updatedStartTimes: merged.updatedStartTimes,
    shows: merged.shows,
    showsVersion: versions['shows.json'],
    watchedByShowId,
    malDown,
  }
}
