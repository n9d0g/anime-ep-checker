'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { TopHeader } from '@/app/components/TopHeader'
import { PtwListSkeleton } from '@/app/components/ListSkeleton'
import { useToast } from '@/app/components/Toast'
import type { OnHoldSnapshot, OnHoldSnapshotEntry } from '@/lib/types'

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
  const [snapshot, setSnapshot] = useState<OnHoldSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  async function loadSnapshot() {
    setLoading(true)

    try {
      const response = await fetch('/api/on-hold', { cache: 'no-store' })
      const data = (await response.json()) as {
        error?: string
        onHold?: OnHoldSnapshot | null
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load on-hold list')
      }

      setSnapshot(data.onHold ?? null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load on-hold list'
      )
    } finally {
      setLoading(false)
    }
  }

  function removeEntryFromSnapshot(showId: string) {
    setSnapshot((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        entries: current.entries.filter((item) => item.show.id !== showId),
      }
    })
  }

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
      const response = await fetch('/api/on-hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId }),
      })

      const data = (await response.json()) as {
        error?: string
        malUpdated?: boolean
        workflowTriggered?: boolean
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to restore to watching')
      }

      removeEntryFromSnapshot(showId)

      if (data.malUpdated === false) {
        toast.success(
          'Added to watching. MAL status could not be updated — mark it watching there if needed.'
        )
      } else if (data.workflowTriggered) {
        toast.success(
          'Moved to watching. The dashboard will refresh shortly.'
        )
      } else {
        toast.success('Moved to watching.')
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to restore to watching'
      )
    } finally {
      setRestoringId(null)
    }
  }

  useEffect(() => {
    void loadSnapshot()
  }, [])

  const entries = snapshot?.entries ?? []

  return (
    <>
      <TopHeader />

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
                <article className="show-row ptw-row" key={entry.show.id}>
                  <div className="show-row-header ptw-row-header">
                    {malUrl ? (
                      <a
                        className="ptw-row-main"
                        href={malUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <div className="show-row-leading">
                          <span className="show-row-title">
                            {entry.show.title || entry.show.id}
                          </span>
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
                          <span className="show-row-title">
                            {entry.show.title || entry.show.id}
                          </span>
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
    </>
  )
}
