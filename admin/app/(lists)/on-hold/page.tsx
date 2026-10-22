'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'
import { useCachedResource } from '@/app/components/useCachedResource'
import { useHashScrollHighlight } from '@/app/components/useHashScrollHighlight'
import { PtwListSkeleton } from '@/app/components/ListSkeleton'
import { useToast } from '@/app/components/Toast'
import { apiErrorMessage, apiFetch } from '@/lib/api-fetch'
import { cacheKeys, withoutOnHoldEntry } from '@/lib/client-cache'
import { searchIndex } from '@/lib/search-index-store'
import type { OnHoldSnapshot, OnHoldSnapshotEntry } from '@shared/types'

async function fetchOnHold(): Promise<OnHoldSnapshot | null> {
  const data = await apiFetch<{ onHold?: OnHoldSnapshot | null }>(
    '/api/on-hold',
    { errorMessage: 'Failed to load on-hold list' }
  )
  return data.onHold ?? null
}

function formatHeldMeta(entry: OnHoldSnapshotEntry): string {
  const parts: string[] = []
  const held = new Date(entry.heldAt)
  if (!Number.isNaN(held.getTime())) {
    parts.push(`On hold since ${held.toLocaleDateString()}`)
  }
  if (
    entry.show.schedule.mode === 'finite' &&
    entry.show.schedule.episodeCount
  ) {
    parts.push(`${entry.show.schedule.episodeCount} ep`)
  }
  return parts.join(' · ')
}

export default function OnHoldPage() {
  const toast = useToast()
  useHashScrollHighlight()
  const onHold = useCachedResource({
    cacheKey: cacheKeys.onHold,
    fetch: fetchOnHold,
    isUsable: (cached: OnHoldSnapshot) => Boolean(cached.entries?.length),
  })
  const snapshot = onHold.data
  const loading = onHold.loading
  const [restoringId, setRestoringId] = useState<string | null>(null)

  async function restoreToWatching(entry: OnHoldSnapshotEntry) {
    const showId = entry.show.id
    const label = entry.show.title || showId

    if (
      !window.confirm(
        `Move "${label}" back to watching? It will be tracked again and marked watching on MyAnimeList.`
      )
    ) {
      return
    }

    setRestoringId(showId)

    try {
      const data = await apiFetch<{
        malUpdated?: boolean
        workflowTriggered?: boolean
      }>('/api/on-hold', {
        method: 'POST',
        json: { showId },
        errorMessage: 'Failed to restore to watching',
      })

      onHold.update((current) => withoutOnHoldEntry(current, showId))
      searchIndex.invalidate()

      if (data.malUpdated === false) {
        toast.success(
          'Added to watching. MAL status could not be updated — mark it watching there if needed.'
        )
      } else if (data.workflowTriggered) {
        toast.success('Moved to watching. The dashboard will refresh shortly.')
      } else {
        toast.success('Moved to watching.')
      }
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to restore to watching'))
    } finally {
      setRestoringId(null)
    }
  }

  const entries = snapshot?.entries ?? []

  return (
    <main className="container">
      <div className="page-heading">
        <h1>On hold</h1>
        <p className="subtitle">
          Paused tracked shows. Restore to resume episode checks and Discord
          alerts.
        </p>
      </div>

      {loading ? (
        <PtwListSkeleton />
      ) : entries.length === 0 ? (
        <div className="panel empty">
          No shows on hold. Use <Link href="/">Watching</Link> to pause a
          tracked show.
        </div>
      ) : (
        <div className="panel show-list">
          {entries.map((entry) => {
            const meta = formatHeldMeta(entry)
            const malUrl = entry.show.malId
              ? `https://myanimelist.net/anime/${entry.show.malId}`
              : null
            const restoring = restoringId === entry.show.id

            return (
              <article
                className="show-row ptw-row"
                id={`show-${entry.show.id}`}
                key={entry.show.id}
              >
                <div className="show-row-header ptw-row-header">
                  {malUrl ? (
                    <a
                      className="ptw-row-main"
                      href={malUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className="show-row-leading">
                        <ShowTitleDisplay
                          title={entry.show.title || entry.show.id}
                          titleEnglish={entry.show.titleEnglish}
                        />
                      </div>
                      {meta ? (
                        <div className="show-row-trailing">
                          <span className="ep-count">{meta}</span>
                        </div>
                      ) : null}
                    </a>
                  ) : (
                    <div className="ptw-row-main">
                      <div className="show-row-leading">
                        <ShowTitleDisplay
                          title={entry.show.title || entry.show.id}
                          titleEnglish={entry.show.titleEnglish}
                        />
                      </div>
                      {meta ? (
                        <div className="show-row-trailing">
                          <span className="ep-count">{meta}</span>
                        </div>
                      ) : null}
                    </div>
                  )}
                  <button
                    className="btn btn-secondary ptw-watch-btn"
                    type="button"
                    disabled={restoring}
                    onClick={() => void restoreToWatching(entry)}
                  >
                    {restoring ? 'Saving…' : 'Watching'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {snapshot?.updatedAt ? (
        <p className="hint ptw-updated">
          Last updated {new Date(snapshot.updatedAt).toLocaleString()}
        </p>
      ) : null}
    </main>
  )
}
