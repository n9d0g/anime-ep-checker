'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/app/components/Toast'
import { ApiError, apiErrorMessage, apiFetch } from '@/lib/api-fetch'
import {
  cacheKeys,
  readJsonCache,
  replaceBootstrapShow,
  updateJsonCache,
  withoutBootstrapShow,
  writeJsonCache,
  type BootstrapCache,
} from '@/lib/client-cache'
import { searchIndex } from '@/lib/search-index-store'
import { showToForm } from '@/lib/show-form'
import type { Show } from '@shared/types'
import type { ShowFormValues, ShowStateSummary } from '@/lib/types'
import {
  buildShowViewModel,
  newShowRow,
  orderRowsBySavedNextDrop,
  replaceShowInRows,
  serializeShows,
  showRowValues,
  toShowRows,
  type ShowRow,
  type ShowViewModel,
} from '@/lib/watching'

const AUTO_REFRESH_MS = 15 * 60 * 1000
const FOCUS_REFRESH_MIN_INTERVAL_MS = 60 * 1000

type WatchedResult = {
  watchedByShowId: Record<string, number | null>
  malDown: boolean
} | null

export type ShowStates = Record<string, ShowStateSummary>

export interface DisplayRow {
  row: ShowRow
  index: number
  liveState: ShowStateSummary | undefined
  view: ShowViewModel
}

// Bootstrap/state responses never include MAL watched counts, so carry the
// last known values forward instead of resetting badges to grey.
function withKnownWatched(
  incoming: ShowStates,
  current: ShowStates
): ShowStates {
  const next: ShowStates = {}
  for (const [showId, state] of Object.entries(incoming)) {
    next[showId] = {
      ...state,
      watchedEpisode:
        state.watchedEpisode ?? current[showId]?.watchedEpisode ?? null,
    }
  }
  return next
}

async function fetchWatched(): Promise<WatchedResult> {
  try {
    const data = await apiFetch<{
      watchedByShowId?: Record<string, number | null>
      malDown?: boolean
    }>('/api/mal/watched', { errorMessage: 'Failed to load MAL progress' })
    return data.watchedByShowId
      ? {
          watchedByShowId: data.watchedByShowId,
          malDown: Boolean(data.malDown),
        }
      : null
  } catch {
    // Watched counts are optional for the first paint.
    return null
  }
}

// The Watching list: shows from shows.json (the edited copy and the saved
// one), their live episode state, loading/refresh and saving.
export function useWatchingShows(options: {
  // Silent refreshes wait while an episode change is still being saved.
  isEpisodeSavePending: () => boolean
}) {
  const toast = useToast()
  const [rows, setRows] = useState<ShowRow[]>([])
  // The rows as last loaded or saved; null until the first load.
  const [savedRows, setSavedRows] = useState<ShowRow[] | null>(null)
  const [showStates, setShowStates] = useState<ShowStates>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [malDown, setMalDown] = useState(false)
  const baseline = useMemo(
    () => (savedRows ? serializeShows(showRowValues(savedRows)) : ''),
    [savedRows]
  )
  const rowsRef = useRef(rows)
  const baselineRef = useRef(baseline)
  const savingRef = useRef(saving)
  const optionsRef = useRef(options)
  const loadInFlightRef = useRef(false)
  const lastFetchAtRef = useRef(0)
  // shows.json version the list on screen came from; saves are rejected if
  // the file has changed since, so they never erase shows added elsewhere.
  const showsVersionRef = useRef<string | null>(null)

  rowsRef.current = rows
  baselineRef.current = baseline
  savingRef.current = saving
  optionsRef.current = options

  const isDirty = useMemo(
    () => baseline !== '' && serializeShows(showRowValues(rows)) !== baseline,
    [rows, baseline]
  )

  const displayRows = useMemo<DisplayRow[]>(
    () =>
      orderRowsBySavedNextDrop(rows, savedRows ?? [], showStates).map(
        ({ row, index }) => {
          const liveState = row.values.id
            ? showStates[row.values.id]
            : undefined
          return {
            row,
            index,
            liveState,
            view: buildShowViewModel(row.values, liveState, malDown),
          }
        }
      ),
    [rows, savedRows, showStates, malDown]
  )

  function setLoadedShows(shows: ShowFormValues[]) {
    const loadedRows = toShowRows(shows)
    setRows(loadedRows)
    setSavedRows(loadedRows)
  }

  function hasUnsavedLocalEdits(): boolean {
    return (
      baselineRef.current !== '' &&
      serializeShows(showRowValues(rowsRef.current)) !== baselineRef.current
    )
  }

  function applyWatched(result: WatchedResult) {
    if (!result) {
      return
    }

    const { watchedByShowId } = result
    setMalDown(result.malDown)

    setShowStates((current) => {
      const next = { ...current }
      for (const [showId, watched] of Object.entries(watchedByShowId)) {
        if (!next[showId]) {
          continue
        }
        next[showId] = { ...next[showId], watchedEpisode: watched }
      }
      return next
    })

    const cached = readJsonCache<BootstrapCache>(cacheKeys.bootstrap)
    if (cached?.showStates) {
      for (const [showId, watched] of Object.entries(watchedByShowId)) {
        if (cached.showStates[showId]) {
          cached.showStates[showId].watchedEpisode = watched
        }
      }
      writeJsonCache(cacheKeys.bootstrap, cached)
    }
  }

  async function applyMalBackground() {
    try {
      const syncData = await apiFetch<{
        shows?: Show[]
        changed?: boolean
        showsVersion?: string | null
        watchedByShowId?: Record<string, number | null>
        malDown?: boolean
        resolvedIds?: string[]
        updatedTitles?: string[]
        updatedEpisodeCounts?: string[]
        updatedStartTimes?: string[]
      }>('/api/shows/sync-mal', {
        method: 'POST',
        errorMessage: 'MAL sync failed',
      })

      if (syncData.watchedByShowId) {
        applyWatched({
          watchedByShowId: syncData.watchedByShowId,
          malDown: Boolean(syncData.malDown),
        })
      } else {
        void fetchWatched().then(applyWatched)
      }

      if (syncData.changed && syncData.shows) {
        if (!savingRef.current && !hasUnsavedLocalEdits()) {
          setLoadedShows(syncData.shows.map(showToForm))
          showsVersionRef.current = syncData.showsVersion ?? null
        }

        const parts: string[] = []
        if (syncData.resolvedIds?.length) {
          parts.push('linked MAL IDs')
        }
        if (syncData.updatedTitles?.length) {
          parts.push('synced titles from MAL')
        }
        if (syncData.updatedEpisodeCounts?.length) {
          parts.push('synced episode counts from MAL')
        }
        if (syncData.updatedStartTimes?.length) {
          parts.push('synced release times from MAL')
        }
        if (parts.length > 0) {
          toast.success(`Auto-${parts.join(' and ')}.`)
        }
      }
    } catch (error) {
      void fetchWatched().then(applyWatched)
      if (error instanceof ApiError && error.data !== null) {
        console.warn('MAL sync skipped:', error.message)
      } else {
        console.warn(
          'MAL background sync failed:',
          error instanceof Error ? error.message : error
        )
      }
    }
  }

  async function loadRemoteData(
    loadOptions: { silent?: boolean; syncMal?: boolean } = {}
  ) {
    const silent = loadOptions.silent ?? false
    const syncMal = loadOptions.syncMal ?? false

    if (loadInFlightRef.current) {
      return
    }

    if (silent) {
      if (
        savingRef.current ||
        hasUnsavedLocalEdits() ||
        optionsRef.current.isEpisodeSavePending()
      ) {
        return
      }
    }

    loadInFlightRef.current = true
    if (!silent) {
      setLoading(true)
    }

    try {
      const previousSerialized = silent
        ? serializeShows(showRowValues(rowsRef.current))
        : null

      // Start the slow MAL watched lookup alongside bootstrap, not after it.
      // A MAL sync returns watched counts from its own per-show requests, so
      // loads that sync skip this lookup.
      const watchedPromise = syncMal ? null : fetchWatched()
      const bootstrapData = await apiFetch<{
        shows?: Show[]
        showsVersion?: string | null
        showStates?: ShowStates
      }>('/api/bootstrap', { errorMessage: 'Failed to load shows' })

      const loadedShows = (bootstrapData.shows ?? []).map(showToForm)

      if (silent && (savingRef.current || hasUnsavedLocalEdits())) {
        setShowStates((current) =>
          withKnownWatched(bootstrapData.showStates ?? {}, current)
        )
        lastFetchAtRef.current = Date.now()
        void watchedPromise?.then(applyWatched)
        return
      }

      const nextSerialized = serializeShows(loadedShows)
      setLoadedShows(loadedShows)
      showsVersionRef.current = bootstrapData.showsVersion ?? null
      setShowStates((current) =>
        withKnownWatched(bootstrapData.showStates ?? {}, current)
      )
      lastFetchAtRef.current = Date.now()

      const cachedStates =
        readJsonCache<{ showStates: ShowStates }>(cacheKeys.bootstrap)
          ?.showStates ?? {}
      writeJsonCache(cacheKeys.bootstrap, {
        shows: bootstrapData.shows ?? [],
        showStates: withKnownWatched(
          bootstrapData.showStates ?? {},
          cachedStates
        ),
      })

      if (
        silent &&
        previousSerialized !== null &&
        previousSerialized !== nextSerialized
      ) {
        toast.success('Shows updated.')
      }

      void watchedPromise?.then(applyWatched)
      if (syncMal) {
        void applyMalBackground()
      }
    } catch (error) {
      if (silent) {
        console.warn(
          'Background refresh failed:',
          error instanceof Error ? error.message : error
        )
        return
      }

      toast.error(apiErrorMessage(error, 'Failed to load shows'))
    } finally {
      loadInFlightRef.current = false
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    const cached = readJsonCache<BootstrapCache>(cacheKeys.bootstrap)

    if (cached?.shows?.length) {
      setLoadedShows(cached.shows.map(showToForm))
      setShowStates(cached.showStates ?? {})
      setLoading(false)
    }

    void loadRemoteData({ syncMal: true })
    // Initial load only; background refresh is handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadRemoteData({ silent: true })
    }, AUTO_REFRESH_MS)

    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return
      }

      if (Date.now() - lastFetchAtRef.current < FOCUS_REFRESH_MIN_INTERVAL_MS) {
        return
      }

      void loadRemoteData({ silent: true })
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateRow(
    key: string,
    update: (values: ShowFormValues) => ShowFormValues
  ) {
    setRows((current) =>
      current.map((row) =>
        row.key === key ? { ...row, values: update(row.values) } : row
      )
    )
  }

  function updateShow<K extends keyof ShowFormValues>(
    key: string,
    field: K,
    value: ShowFormValues[K]
  ) {
    updateRow(key, (values) => ({ ...values, [field]: value }))
  }

  function updateSchedule(
    key: string,
    field: keyof ShowFormValues['schedule'],
    value: string
  ) {
    updateRow(key, (values) => ({
      ...values,
      schedule: { ...values.schedule, [field]: value },
    }))
  }

  function addShow() {
    setRows((current) => [...current, newShowRow()])
  }

  function removeShow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key))
  }

  // Drops a show the server already removed (completed or on hold).
  function removeShowFromLocal(
    showId: string,
    versions: {
      showsVersion?: string | null
      showsVersionBefore?: string | null
    }
  ): void {
    // The server only removed this show. If shows.json was still at the
    // version this page loaded, the rest of the list (and any unsaved edits)
    // matches the new version; otherwise keep the old one so the next save is
    // rejected rather than erasing changes made elsewhere.
    if (versions.showsVersionBefore === showsVersionRef.current) {
      showsVersionRef.current = versions.showsVersion ?? null
    }
    setRows((current) => current.filter((row) => row.values.id !== showId))
    setSavedRows((current) =>
      current ? current.filter((row) => row.values.id !== showId) : current
    )
    setShowStates((current) => {
      const next = { ...current }
      delete next[showId]
      return next
    })
    // Keep it out of the cached list too, or the next visit shows it again
    // until the fetch lands.
    updateJsonCache<BootstrapCache>(cacheKeys.bootstrap, (cached) =>
      withoutBootstrapShow(cached, showId)
    )
    searchIndex.invalidate()
  }

  async function saveShows() {
    setSaving(true)

    try {
      // A 409 (shows.json changed elsewhere) throws here, keeping the edits.
      const data = await apiFetch<{
        shows?: Show[]
        showsVersion?: string | null
        cleanupTriggered?: boolean
      }>('/api/shows', {
        method: 'PUT',
        json: {
          shows: showRowValues(rows),
          version: showsVersionRef.current,
        },
        errorMessage: 'Failed to save shows',
      })

      setLoadedShows((data.shows ?? []).map(showToForm))
      showsVersionRef.current = data.showsVersion ?? null
      // Shows removed (or added) by the save leave (or join) the cached list.
      updateJsonCache<BootstrapCache>(cacheKeys.bootstrap, (cached) => ({
        ...cached,
        shows: data.shows ?? [],
      }))
      searchIndex.invalidate()
      if (data.cleanupTriggered) {
        toast.success(
          'Saved to GitHub. Calendar and Discord cleanup will run shortly.'
        )
      } else {
        toast.success(
          'Saved to GitHub. The checker will use these on the next run.'
        )
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to save shows'))
    } finally {
      setSaving(false)
    }
  }

  async function delayShowByOneWeek(show: ShowFormValues) {
    if (!show.id) {
      return
    }

    const label = show.title || show.id
    if (
      !window.confirm(
        `Delay "${label}" by one week? Future drops shift and Discord/Calendar events rebuild.`
      )
    ) {
      return
    }

    try {
      const data = await apiFetch<{
        workflowTriggered?: boolean
        show?: Show
        showsVersion?: string | null
        showsVersionBefore?: string | null
      }>('/api/shows/delay', {
        method: 'POST',
        json: { showId: show.id },
        errorMessage: 'Failed to delay show',
      })

      // Apply the server's copy of just this show: no refetch, and unsaved
      // edits on other shows stay on screen.
      if (data.show) {
        const delayed = showToForm(data.show)
        setRows((current) => replaceShowInRows(current, delayed))
        setSavedRows((current) =>
          current ? replaceShowInRows(current, delayed) : current
        )
        const delayedShow = data.show
        updateJsonCache<BootstrapCache>(cacheKeys.bootstrap, (cached) =>
          replaceBootstrapShow(cached, delayedShow)
        )
      }
      // Same rule as removeShowFromLocal: only adopt the new version if
      // shows.json hadn't changed elsewhere since this page loaded it.
      if (data.showsVersionBefore === showsVersionRef.current) {
        showsVersionRef.current = data.showsVersion ?? null
      }

      toast.success(
        data.workflowTriggered
          ? 'Delayed one week. Forced check started to rebuild events.'
          : 'Delayed one week. Run Actions → Check with force to rebuild events.'
      )
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to delay show'))
    }
  }

  return {
    rows,
    displayRows,
    showStates,
    setShowStates,
    malDown,
    setMalDown,
    loading,
    saving,
    isDirty,
    addShow,
    updateShow,
    updateSchedule,
    removeShow,
    removeShowFromLocal,
    saveShows,
    delayShowByOneWeek,
  }
}
