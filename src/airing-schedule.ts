// Keeps each show's saved AniList airing schedule fresh. The schedule's drop
// times (shared/schedule.ts) follow it, so a break in the broadcast shifts
// every later drop.
import { fetchAnilistAiring, type AnilistAiring } from './anilist.ts'
import {
  getDropWindowMode,
  getNextDrop,
  isEpisodeInSchedule,
} from '../shared/schedule.ts'
import type { AiringSchedule, Show, ShowState } from '../shared/types.ts'

/** About once a day (a little under, so a daily run never just misses it). */
const REFRESH_INTERVAL_MS = 23 * 60 * 60 * 1000

type FetchAiring = (
  malId: number
) => Promise<{ nodes: AnilistAiring[]; officialSiteUrl?: string | null } | null>

/**
 * Whether to fetch the show's airing schedule this run: it has a MAL ID and
 * no saved schedule, a day-old one, or its next drop is in its drop window
 * or a late slot (when a last-minute schedule change matters most).
 */
/**
 * Whether a refreshed schedule should be written to state: when its episode
 * times changed, or when the saved copy is a day old (so quiet runs don't
 * re-fetch AniList every time). At most one save a day per show otherwise.
 */
export function shouldSaveAiringSchedule(
  saved: AiringSchedule | null | undefined,
  refreshed: AiringSchedule,
  episodesChanged: boolean,
  now: Date
): boolean {
  if (episodesChanged) return true
  if (refreshed.fetchedAt === saved?.fetchedAt) return false
  const savedMs = saved ? Date.parse(saved.fetchedAt) : Number.NaN
  return Number.isNaN(savedMs) || now.getTime() - savedMs >= REFRESH_INTERVAL_MS
}

export function needsAiringScheduleRefresh(
  show: Show,
  showState: ShowState | null,
  now: Date
): boolean {
  if (!show.malId) {
    return false
  }

  const saved = showState?.airingSchedule
  const fetchedMs = saved ? Date.parse(saved.fetchedAt) : Number.NaN
  if (
    Number.isNaN(fetchedMs) ||
    now.getTime() - fetchedMs >= REFRESH_INTERVAL_MS
  ) {
    return true
  }

  const nextDrop = getNextDrop(
    show.schedule,
    showState?.lastEpisodeNumber,
    saved
  )
  return Boolean(
    nextDrop?.expectedAt && getDropWindowMode(nextDrop.expectedAt, now)
  )
}

/** The schedule's episodes as broadcast times, in episode order. */
function toAiringEpisodes(
  show: Show,
  nodes: AnilistAiring[]
): Record<string, string> {
  const episodes: Record<string, string> = {}
  const sorted = [...nodes].sort((a, b) => a.episode - b.episode)
  for (const node of sorted) {
    if (isEpisodeInSchedule(show.schedule, node.episode)) {
      episodes[String(node.episode)] = new Date(
        node.airingAt * 1000
      ).toISOString()
    }
  }
  return episodes
}

function sameEpisodes(
  a: Record<string, string> | undefined,
  b: Record<string, string>
): boolean {
  if (!a) return false
  const aKeys = Object.keys(a)
  return (
    aKeys.length === Object.keys(b).length &&
    aKeys.every((key) => a[key] === b[key])
  )
}

export interface AiringScheduleRefresh {
  /** The schedule to use this run: freshly fetched, or the saved one. */
  airingSchedule: AiringSchedule | null
  /** Whether the episode times differ from the saved schedule. */
  episodesChanged: boolean
  /** AniList's Official Site link when fetched this run (null: none listed). */
  officialSiteUrl?: string | null
}

/**
 * Fetches the show's AniList airing schedule when due. A failed fetch keeps
 * the saved schedule (and is only logged), so AniList never fails a show.
 */
export async function refreshAiringSchedule({
  show,
  showState,
  now,
  fetchAiring = fetchAnilistAiring,
}: {
  show: Show
  showState: ShowState | null
  now: Date
  fetchAiring?: FetchAiring
}): Promise<AiringScheduleRefresh> {
  const saved = showState?.airingSchedule ?? null
  if (!show.malId || !needsAiringScheduleRefresh(show, showState, now)) {
    return { airingSchedule: saved, episodesChanged: false }
  }

  let fetched: Awaited<ReturnType<FetchAiring>> = null
  try {
    fetched = await fetchAiring(show.malId)
  } catch (error) {
    console.warn(
      `  AniList airing schedule failed: ${
        error instanceof Error ? error.message : error
      }`
    )
  }
  if (!fetched) {
    return { airingSchedule: saved, episodesChanged: false }
  }

  const episodes = toAiringEpisodes(show, fetched.nodes)
  return {
    airingSchedule: { fetchedAt: now.toISOString(), episodes },
    episodesChanged: !sameEpisodes(saved?.episodes, episodes),
    officialSiteUrl: fetched.officialSiteUrl ?? null,
  }
}
