import type {
  OnHoldSnapshot,
  PlanToWatchSnapshot,
  PlanToWatchSnapshotEntry,
  Show,
} from '@shared/types'
import type { ShowStateSummary } from './types'

const BOOTSTRAP_CACHE_KEY = 'aec-admin-bootstrap-v1'
const PTW_CACHE_KEY = 'aec-admin-ptw-v1'
const ON_HOLD_CACHE_KEY = 'aec-admin-on-hold-v1'
const WATCHED_CACHE_KEY = 'aec-admin-watched-v1'
const PTW_DETAILS_CACHE_KEY = 'aec-admin-ptw-details-v1'

/** What the Watching list caches from /api/bootstrap. */
export interface BootstrapCache {
  shows: Show[]
  showStates: Record<string, ShowStateSummary>
  /** Plan to watch shows that started airing (for the inbox). */
  airingPlanToWatch?: PlanToWatchSnapshotEntry[]
}

export function readJsonCache<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeJsonCache<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota errors.
  }
}

/** Rewrites a cached value in place; does nothing if nothing is cached. */
export function updateJsonCache<T>(key: string, update: (value: T) => T): void {
  const cached = readJsonCache<T>(key)
  if (cached !== null) {
    writeJsonCache(key, update(cached))
  }
}

export const cacheKeys = {
  bootstrap: BOOTSTRAP_CACHE_KEY,
  ptw: PTW_CACHE_KEY,
  onHold: ON_HOLD_CACHE_KEY,
  watched: WATCHED_CACHE_KEY,
  ptwDetails: PTW_DETAILS_CACHE_KEY,
}

// A show moved off a list must leave that list's cached copy too, or the
// next visit renders it from the cache until the fetch replaces it.

export function withoutPtwEntry(
  snapshot: PlanToWatchSnapshot,
  malId: number
): PlanToWatchSnapshot {
  return {
    ...snapshot,
    entries: snapshot.entries.filter((entry) => entry.malId !== malId),
  }
}

export function withoutOnHoldEntry(
  snapshot: OnHoldSnapshot,
  showId: string
): OnHoldSnapshot {
  return {
    ...snapshot,
    entries: snapshot.entries.filter((entry) => entry.show.id !== showId),
  }
}

export function withoutBootstrapShow(
  cache: BootstrapCache,
  showId: string
): BootstrapCache {
  const showStates = { ...cache.showStates }
  delete showStates[showId]
  return {
    ...cache,
    shows: cache.shows.filter((show) => show.id !== showId),
    showStates,
  }
}

export function replaceBootstrapShow(
  cache: BootstrapCache,
  show: Show
): BootstrapCache {
  return {
    ...cache,
    shows: cache.shows.map((item) => (item.id === show.id ? show : item)),
  }
}
