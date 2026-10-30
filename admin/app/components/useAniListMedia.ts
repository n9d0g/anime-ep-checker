'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AniListMedia } from '@/lib/anilist'
import {
  mergeAniListAnswers,
  missingMalIds,
  type AniListCache,
} from '@/lib/anilist-cache'
import { apiFetch } from '@/lib/api-fetch'
import { cacheKeys, readJsonCache, writeJsonCache } from '@/lib/client-cache'

const UPDATED_EVENT = 'aec:anilist-updated'

// IDs some page is already asking about, so lists open at once don't ask twice.
const inFlight = new Set<number>()

function readCache(): AniListCache {
  return readJsonCache<AniListCache>(cacheKeys.anilist) ?? {}
}

/**
 * AniList banners, covers and producers for the shows on screen. Answers are
 * kept in this browser for a week, so a warm visit asks for nothing; a cold
 * one asks once for every show not yet known.
 */
export function useAniListMedia(
  malIds: number[]
): (malId: number | string | null | undefined) => AniListMedia | null {
  const [cache, setCache] = useState<AniListCache>({})
  const idsKey = malIds.join(',')

  useEffect(() => {
    function onUpdated() {
      setCache(readCache())
    }
    window.addEventListener(UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(UPDATED_EVENT, onUpdated)
  }, [])

  useEffect(() => {
    const stored = readCache()
    setCache(stored)
    const ids = idsKey ? idsKey.split(',').map(Number) : []
    const missing = missingMalIds(stored, ids, Date.now()).filter(
      (id) => !inFlight.has(id)
    )
    if (missing.length === 0) {
      return
    }

    for (const id of missing) {
      inFlight.add(id)
    }
    apiFetch<{ media?: Record<string, AniListMedia> }>('/api/anilist', {
      method: 'POST',
      json: { malIds: missing },
      errorMessage: 'Failed to load AniList artwork',
    })
      .then((data) => {
        writeJsonCache(
          cacheKeys.anilist,
          mergeAniListAnswers(
            readCache(),
            missing,
            data.media ?? {},
            Date.now()
          )
        )
        window.dispatchEvent(new Event(UPDATED_EVENT))
      })
      .catch(() => {
        // Rows fall back to plain dark backgrounds; the next visit retries.
      })
      .finally(() => {
        for (const id of missing) {
          inFlight.delete(id)
        }
      })
  }, [idsKey])

  return useCallback(
    (malId) => (malId ? (cache[String(malId)]?.media ?? null) : null),
    [cache]
  )
}
