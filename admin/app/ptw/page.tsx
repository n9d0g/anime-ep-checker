'use client'

import { useEffect, useMemo, useState } from 'react'
import { TopHeader } from '@/app/components/TopHeader'
import type { PlanToWatchSnapshot, PlanToWatchSnapshotEntry } from '@/lib/types'

function formatBroadcast(entry: PlanToWatchSnapshotEntry): string {
  const parts: string[] = []

  if (entry.startDate) {
    parts.push(entry.startDate)
  }

  if (entry.broadcast?.dayOfWeek) {
    const time = entry.broadcast.startTime
      ? ` ${entry.broadcast.startTime}`
      : ''
    parts.push(`${entry.broadcast.dayOfWeek}${time}`)
  }

  return parts.join(' · ')
}

function PtwSection({
  title,
  entries,
}: {
  title: string
  entries: PlanToWatchSnapshotEntry[]
}) {
  if (entries.length === 0) {
    return null
  }

  return (
    <section className="stack">
      <h2>{title}</h2>
      <div className="panel ptw-list">
        {entries.map((entry) => {
          const meta = formatBroadcast(entry)
          const malUrl = `https://myanimelist.net/anime/${entry.malId}`

          return (
            <article className="ptw-row" key={entry.malId}>
              {entry.coverUrl ? (
                <img
                  className="ptw-cover"
                  src={entry.coverUrl}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <div className="ptw-cover ptw-cover-placeholder" aria-hidden="true" />
              )}
              <div className="ptw-body">
                <a
                  className="ptw-title"
                  href={malUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {entry.title}
                </a>
                {meta ? <p className="ptw-meta">{meta}</p> : null}
                {entry.numEpisodes ? (
                  <p className="ptw-meta">{entry.numEpisodes} episodes</p>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default function PlanToWatchPage() {
  const [snapshot, setSnapshot] = useState<PlanToWatchSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('')

  const sections = useMemo(() => {
    const entries = snapshot?.entries ?? []

    return {
      airing: entries.filter((entry) => entry.status === 'currently_airing'),
      upcoming: entries.filter((entry) => entry.status === 'not_yet_aired'),
      aired: entries.filter((entry) => entry.status === 'finished_airing'),
    }
  }, [snapshot])

  async function loadSnapshot() {
    setLoading(true)
    setStatus('')
    setStatusType('')

    try {
      const response = await fetch('/api/ptw')
      const data = (await response.json()) as {
        error?: string
        planToWatch?: PlanToWatchSnapshot | null
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load plan-to-watch list')
      }

      setSnapshot(data.planToWatch ?? null)
    } catch (error) {
      setStatusType('error')
      setStatus(
        error instanceof Error ? error.message : 'Failed to load plan-to-watch list'
      )
    } finally {
      setLoading(false)
    }
  }

  async function refreshSnapshot() {
    setRefreshing(true)
    setStatus('')
    setStatusType('')

    try {
      const response = await fetch('/api/ptw', { method: 'POST' })
      const data = (await response.json()) as {
        error?: string
        planToWatch?: PlanToWatchSnapshot
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to refresh plan-to-watch list')
      }

      setSnapshot(data.planToWatch ?? null)
      setStatusType('success')
      setStatus('Refreshed from MyAnimeList.')
    } catch (error) {
      setStatusType('error')
      setStatus(
        error instanceof Error
          ? error.message
          : 'Failed to refresh plan-to-watch list'
      )
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadSnapshot()
  }, [])

  const hasEntries =
    sections.airing.length > 0 ||
    sections.upcoming.length > 0 ||
    sections.aired.length > 0

  return (
    <>
      <TopHeader />

      <main className="container">
        <div className="page-heading page-heading-row">
          <div>
            <h1>Plan to watch</h1>
            <p className="subtitle">
              MyAnimeList plan-to-watch list grouped by airing status.
            </p>
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void refreshSnapshot()}
            disabled={loading || refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {status ? (
          <p className={`status ${statusType}`}>{status}</p>
        ) : null}

        {loading ? (
          <p className="status">Loading plan-to-watch list...</p>
        ) : !hasEntries ? (
          <div className="panel empty">
            {snapshot?.updatedAt
              ? 'No plan-to-watch entries in the saved snapshot.'
              : 'No snapshot yet. Refresh from MyAnimeList to load your list.'}
          </div>
        ) : (
          <div className="stack ptw-sections">
            <PtwSection title="Airing" entries={sections.airing} />
            <PtwSection title="Not yet aired" entries={sections.upcoming} />
            <PtwSection title="Aired" entries={sections.aired} />
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
