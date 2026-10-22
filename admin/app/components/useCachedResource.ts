'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/app/components/Toast'
import { apiErrorMessage } from '@/lib/api-fetch'
import {
  readJsonCache,
  updateJsonCache,
  writeJsonCache,
} from '@/lib/client-cache'

export interface CachedResourceOptions<T> {
  /** localStorage key (see cacheKeys) the last loaded copy is kept under. */
  cacheKey: string
  /** Loads the current data; null means there is none yet (not cached). */
  fetch: () => Promise<T | null>
  /** Whether a cached copy is worth rendering while the first fetch runs. */
  isUsable: (cached: T) => boolean
  /** Runs after each successful load. */
  onLoad?: (data: T | null) => void
  /** Defaults to an error toast. */
  onError?: (error: unknown) => void
}

// A list page's data: rendered from the local cache straight away when there
// is a usable copy, then replaced by a fetch. Every change made through
// `set`/`update` is written back to the cache, so a later visit never renders
// stale entries from it (e.g. a show that was just moved to another list).
export function useCachedResource<T>(options: CachedResourceOptions<T>) {
  const toast = useToast()
  const { cacheKey } = options
  const [data, setDataState] = useState<T | null>(null)
  // True until there is something to render: a usable cache or a first fetch.
  const [loading, setLoading] = useState(true)
  // True while a fetch is in flight, including the first one.
  const [fetching, setFetching] = useState(false)
  const dataRef = useRef<T | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const set = useCallback(
    (next: T | null) => {
      dataRef.current = next
      setDataState(next)
      if (next !== null) {
        writeJsonCache(cacheKey, next)
      }
    },
    [cacheKey]
  )

  const update = useCallback(
    (change: (current: T) => T) => {
      if (dataRef.current === null) {
        updateJsonCache(cacheKey, change)
        return
      }
      set(change(dataRef.current))
    },
    [cacheKey, set]
  )

  const reload = useCallback(async (): Promise<boolean> => {
    setFetching(true)

    try {
      const next = await optionsRef.current.fetch()
      set(next)
      optionsRef.current.onLoad?.(next)
      return true
    } catch (error) {
      const onError = optionsRef.current.onError
      if (onError) {
        onError(error)
      } else {
        toast.error(apiErrorMessage(error, 'Failed to load'))
      }
      return false
    } finally {
      setLoading(false)
      setFetching(false)
    }
  }, [set, toast])

  useEffect(() => {
    const cached = readJsonCache<T>(cacheKey)
    if (cached !== null && optionsRef.current.isUsable(cached)) {
      dataRef.current = cached
      setDataState(cached)
      setLoading(false)
    }

    void reload()
    // Load once per mount; reload() is for later refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  return { data, loading, fetching, reload, set, update }
}
