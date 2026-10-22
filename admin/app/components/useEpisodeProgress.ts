'use client'

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { CompletePrompt } from '@/app/components/CompleteRatingModal'
import { useToast } from '@/app/components/Toast'
import { ApiError, apiErrorMessage, apiFetch } from '@/lib/api-fetch'
import type { ShowFormValues, ShowStateSummary } from '@/lib/types'
import { getWatchedEpisode, stepEpisode, usesMalProgress } from '@/lib/watching'

const EPISODE_SAVE_DEBOUNCE_MS = 800

export type EpisodeSaveStatus = 'saving' | 'saved' | 'error' | ''

type RemovedVersions = {
  showsVersion?: string | null
  showsVersionBefore?: string | null
}

function validMalId(show: ShowFormValues): number | null {
  const malId = Number(show.malId)
  return Number.isFinite(malId) && malId >= 1 ? malId : null
}

// Episode progress for the Watching list: the +/- stepper (saved to MAL for
// linked shows, otherwise to state.json) and the complete / on-hold flows
// that take a show off the list.
export function useEpisodeProgress({
  showStates,
  setShowStates,
  setMalDown,
  removeShowFromLocal,
}: {
  showStates: Record<string, ShowStateSummary>
  setShowStates: Dispatch<SetStateAction<Record<string, ShowStateSummary>>>
  setMalDown: (malDown: boolean) => void
  removeShowFromLocal: (showId: string, versions: RemovedVersions) => void
}) {
  const toast = useToast()
  const [episodeSaveStatus, setEpisodeSaveStatus] = useState<
    Record<string, EpisodeSaveStatus>
  >({})
  const episodeDebounceRefs = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({})
  const [completePrompt, setCompletePrompt] = useState<CompletePrompt | null>(
    null
  )
  const [completingShow, setCompletingShow] = useState(false)
  const [holdingShowId, setHoldingShowId] = useState<string | null>(null)
  const episodeSaveStatusRef = useRef(episodeSaveStatus)

  episodeSaveStatusRef.current = episodeSaveStatus

  useEffect(() => {
    return () => {
      for (const timer of Object.values(episodeDebounceRefs.current)) {
        clearTimeout(timer)
      }
    }
  }, [])

  function hasPendingSave(): boolean {
    return Object.values(episodeSaveStatusRef.current).some(
      (status) => status === 'saving'
    )
  }

  function clearDebounce(showId: string) {
    const timer = episodeDebounceRefs.current[showId]
    if (timer) {
      clearTimeout(timer)
      delete episodeDebounceRefs.current[showId]
    }
  }

  function removeShow(showId: string, versions: RemovedVersions) {
    removeShowFromLocal(showId, versions)
    setEpisodeSaveStatus((current) => {
      const next = { ...current }
      delete next[showId]
      return next
    })
    clearDebounce(showId)
  }

  async function persistMalProgress(
    showId: string,
    malId: number,
    episodeNumber: number
  ): Promise<void> {
    setEpisodeSaveStatus((current) => ({ ...current, [showId]: 'saving' }))

    try {
      const data = await apiFetch<{ watched?: number; malDown?: boolean }>(
        '/api/mal/progress',
        {
          method: 'PATCH',
          json: { malId, episodeNumber },
          errorMessage: 'Failed to update MAL progress',
        }
      )

      if (data.malDown) {
        setMalDown(true)
      }

      if (typeof data.watched === 'number') {
        setShowStates((current) => ({
          ...current,
          [showId]: {
            ...current[showId],
            watchedEpisode: data.watched,
          },
        }))
      }

      setEpisodeSaveStatus((current) => ({ ...current, [showId]: 'saved' }))
      toast.success('Episode updated.')
    } catch (error) {
      // A failed update can still report MAL as down.
      if (
        error instanceof ApiError &&
        (error.data as { malDown?: boolean } | null)?.malDown
      ) {
        setMalDown(true)
      }
      setEpisodeSaveStatus((current) => ({ ...current, [showId]: 'error' }))
      toast.error(apiErrorMessage(error, 'Failed to update MAL progress'))
    }
  }

  async function persistEpisodeNumber(
    showId: string,
    episodeNumber: number
  ): Promise<void> {
    setEpisodeSaveStatus((current) => ({ ...current, [showId]: 'saving' }))

    try {
      const data = await apiFetch<{ show?: ShowStateSummary }>('/api/state', {
        method: 'PATCH',
        json: { showId, episodeNumber },
        errorMessage: 'Failed to update episode',
      })

      if (data.show) {
        setShowStates((current) => ({
          ...current,
          [showId]: {
            ...current[showId],
            ...data.show!,
          },
        }))
      }

      setEpisodeSaveStatus((current) => ({ ...current, [showId]: 'saved' }))
      toast.success('Episode updated.')
    } catch (error) {
      setEpisodeSaveStatus((current) => ({ ...current, [showId]: 'error' }))
      toast.error(apiErrorMessage(error, 'Failed to update episode'))
    }
  }

  function openCompletePrompt(
    show: ShowFormValues,
    pendingEpisodeAtMax?: number
  ) {
    if (!show.id || !usesMalProgress(show)) {
      return
    }

    const malId = validMalId(show)
    if (malId === null) {
      return
    }

    clearDebounce(show.id)

    setCompletePrompt({
      showId: show.id,
      malId,
      title: show.title.trim() || show.id,
      pendingEpisodeAtMax,
    })
  }

  function cancelCompletePrompt(): void {
    const prompt = completePrompt
    setCompletePrompt(null)

    if (
      prompt?.pendingEpisodeAtMax !== undefined &&
      Number.isFinite(prompt.pendingEpisodeAtMax)
    ) {
      void persistMalProgress(
        prompt.showId,
        prompt.malId,
        prompt.pendingEpisodeAtMax
      )
    }
  }

  async function confirmCompletePrompt(score: number): Promise<void> {
    const prompt = completePrompt
    if (!prompt) {
      return
    }

    setCompletingShow(true)

    try {
      const data = await apiFetch<{
        cleanupTriggered?: boolean
        showsVersion?: string | null
        showsVersionBefore?: string | null
      }>('/api/mal/complete', {
        method: 'POST',
        json: { malId: prompt.malId, showId: prompt.showId, score },
        errorMessage: 'Failed to mark show completed',
      })

      removeShow(prompt.showId, data)
      setCompletePrompt(null)

      toast.success(
        data.cleanupTriggered
          ? 'Marked completed on MAL. Discord and calendar cleanup will run shortly.'
          : 'Marked completed on MAL and removed from tracked shows.'
      )
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to mark show completed'))
    } finally {
      setCompletingShow(false)
    }
  }

  async function putShowOnHold(show: ShowFormValues): Promise<void> {
    if (!show.id || !usesMalProgress(show)) {
      return
    }

    const malId = validMalId(show)
    if (malId === null) {
      return
    }

    const label = show.title.trim() || show.id
    if (
      !window.confirm(
        `Put "${label}" on hold? It will be removed from tracked shows and marked on hold on MyAnimeList.`
      )
    ) {
      return
    }

    setHoldingShowId(show.id)

    try {
      const data = await apiFetch<{
        cleanupTriggered?: boolean
        showsVersion?: string | null
        showsVersionBefore?: string | null
      }>('/api/mal/on-hold', {
        method: 'POST',
        json: { malId, showId: show.id },
        errorMessage: 'Failed to put show on hold',
      })

      removeShow(show.id, data)

      toast.success(
        data.cleanupTriggered
          ? 'On hold on MAL. Discord and calendar cleanup will run shortly.'
          : 'On hold on MAL and removed from tracked shows.'
      )
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to put show on hold'))
    } finally {
      setHoldingShowId(null)
    }
  }

  function adjustEpisode(show: ShowFormValues, delta: number): void {
    const malLinked = usesMalProgress(show)
    const current = malLinked
      ? getWatchedEpisode(showStates[show.id])
      : Number(showStates[show.id]?.lastEpisodeNumber)
    const step = stepEpisode(show, current, delta)
    if (!step) {
      return
    }

    const { base, next, max } = step

    if (malLinked) {
      const malId = validMalId(show)
      if (malId === null) {
        return
      }

      setShowStates((currentStates) => ({
        ...currentStates,
        [show.id]: {
          ...(currentStates[show.id] ?? {
            lastEpisodeNumber: '',
            lastEpisodeTitle: '',
            lastNotifiedAt: '',
          }),
          watchedEpisode: next,
        },
      }))

      const existingTimer = episodeDebounceRefs.current[show.id]
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      if (max !== null && next === max) {
        openCompletePrompt(show, next)
        return
      }

      episodeDebounceRefs.current[show.id] = setTimeout(() => {
        void persistMalProgress(show.id, malId, next)
      }, EPISODE_SAVE_DEBOUNCE_MS)

      return
    }

    setShowStates((currentStates) => ({
      ...currentStates,
      [show.id]: {
        ...(currentStates[show.id] ?? {
          lastEpisodeNumber: String(base),
          lastEpisodeTitle: '',
          lastNotifiedAt: '',
        }),
        lastEpisodeNumber: String(next),
      },
    }))

    const existingTimer = episodeDebounceRefs.current[show.id]
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    episodeDebounceRefs.current[show.id] = setTimeout(() => {
      void persistEpisodeNumber(show.id, next)
    }, EPISODE_SAVE_DEBOUNCE_MS)
  }

  return {
    episodeSaveStatus,
    hasPendingSave,
    adjustEpisode,
    completePrompt,
    completingShow,
    holdingShowId,
    openCompletePrompt,
    cancelCompletePrompt,
    confirmCompletePrompt,
    putShowOnHold,
  }
}
