import { matchSearchQuery } from './search'
import type { WatchedEntry } from './types'

export type WatchedSort = 'recent' | 'score' | 'title' | 'aired'

export const WATCHED_SORT_LABELS: Record<WatchedSort, string> = {
  recent: 'Recent',
  score: 'Score',
  title: 'Title',
  aired: 'Aired',
}

const SEASON_ORDER: Record<string, number> = {
  winter: 0,
  spring: 1,
  summer: 2,
  fall: 3,
}


function compareTitles(a: WatchedEntry, b: WatchedEntry): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
}

/**
 * Best guess at when you finished: MAL finish date, else the last time the
 * list entry was updated (usually when it was marked completed).
 */
export function getWatchedDate(entry: WatchedEntry): string | null {
  return entry.finishedAt ?? entry.updatedAt
}

function getWatchedTime(entry: WatchedEntry): number {
  const value = getWatchedDate(entry)
  const time = value ? new Date(value).getTime() : NaN
  return Number.isNaN(time) ? -Infinity : time
}

function getSeasonKey(entry: WatchedEntry): number {
  if (!entry.season) {
    return -Infinity
  }
  return entry.season.year * 4 + (SEASON_ORDER[entry.season.season] ?? 0)
}

export function sortWatched(
  entries: WatchedEntry[],
  sort: WatchedSort
): WatchedEntry[] {
  const sorted = [...entries]

  sorted.sort((a, b) => {
    let diff = 0
    if (sort === 'recent') {
      diff = getWatchedTime(b) - getWatchedTime(a)
    } else if (sort === 'score') {
      diff = (b.score ?? -1) - (a.score ?? -1)
      if (diff === 0) {
        diff = getWatchedTime(b) - getWatchedTime(a)
      }
    } else if (sort === 'aired') {
      diff = getSeasonKey(b) - getSeasonKey(a)
    }
    return diff || compareTitles(a, b)
  })

  return sorted
}

export function filterWatched(
  entries: WatchedEntry[],
  query: string
): WatchedEntry[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return entries
  }
  return entries.filter(
    (entry) =>
      matchSearchQuery(trimmed, entry) ||
      [...entry.studios, ...entry.genres].some((name) =>
        matchSearchQuery(trimmed, { title: name })
      )
  )
}

export interface WatchedGroup {
  key: string
  title: string | null
  entries: WatchedEntry[]
}

/** Recent sort groups by year watched; score sort by your score. */
export function groupWatched(
  entries: WatchedEntry[],
  sort: WatchedSort
): WatchedGroup[] {
  if (sort !== 'recent' && sort !== 'score') {
    return [{ key: 'all', title: null, entries }]
  }

  const groups: WatchedGroup[] = []
  for (const entry of entries) {
    let key: string
    let title: string
    if (sort === 'recent') {
      const date = getWatchedDate(entry)
      key = date ? date.slice(0, 4) : 'undated'
      title = date ? key : 'No date'
    } else {
      key = entry.score ? String(entry.score) : 'unscored'
      title = entry.score ? `Scored ${entry.score}` : 'Unscored'
    }

    const last = groups.at(-1)
    if (last?.key === key) {
      last.entries.push(entry)
    } else {
      groups.push({ key, title, entries: [entry] })
    }
  }

  return groups
}

export interface WatchedStats {
  count: number
  scoredCount: number
  meanScore: number | null
  episodes: number
  watchSeconds: number
}

export function getWatchedStats(entries: WatchedEntry[]): WatchedStats {
  let scoreSum = 0
  let scoredCount = 0
  let episodes = 0
  let watchSeconds = 0

  for (const entry of entries) {
    if (entry.score) {
      scoreSum += entry.score
      scoredCount++
    }
    const views = 1 + entry.timesRewatched
    if (entry.numEpisodes) {
      episodes += entry.numEpisodes * views
      if (entry.episodeDurationSec) {
        watchSeconds += entry.numEpisodes * entry.episodeDurationSec * views
      }
    }
  }

  return {
    count: entries.length,
    scoredCount,
    meanScore: scoredCount > 0 ? scoreSum / scoredCount : null,
    episodes,
    watchSeconds,
  }
}

export function formatWatchDuration(seconds: number): string {
  const hours = seconds / 3600
  if (hours < 48) {
    return `${Math.round(hours)}h`
  }
  return `${(hours / 24).toFixed(1)} days`
}
