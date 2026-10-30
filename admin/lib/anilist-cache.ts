import type { AniListMedia } from './anilist'

/** How long an answer is kept before asking AniList again. */
export const ANILIST_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Cached AniList answers by MAL ID; null means AniList doesn't list it. */
export type AniListCache = Record<
  string,
  { media: AniListMedia | null; fetchedAt: number }
>

/** The IDs with no fresh answer yet. */
export function missingMalIds(
  cache: AniListCache,
  malIds: number[],
  now: number
): number[] {
  return [...new Set(malIds)].filter((id) => {
    const entry = cache[String(id)]
    return !entry || now - entry.fetchedAt > ANILIST_CACHE_TTL_MS
  })
}

/**
 * Adds a lookup's answers. `asked` must be only IDs AniList actually
 * responded about, so a show it lacks is remembered but a failed request isn't.
 */
export function mergeAniListAnswers(
  cache: AniListCache,
  asked: number[],
  media: Record<number, AniListMedia>,
  now: number
): AniListCache {
  const next = { ...cache }
  for (const id of asked) {
    next[String(id)] = { media: media[id] ?? null, fetchedAt: now }
  }
  return next
}
