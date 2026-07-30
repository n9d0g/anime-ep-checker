'use client'

import { useEffect, useMemo, useState } from 'react'
import { TopHeader } from '@/app/components/TopHeader'
import { PtwListSkeleton } from '@/app/components/ListSkeleton'
import type { PlanToWatchSnapshot, PlanToWatchSnapshotEntry } from '@/lib/types'

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  )
}

interface StartDateBounds {
  start: Date
  end: Date
}

function parseStartDateBounds(startDate: string): StartDateBounds | null {
  const trimmed = startDate.trim()
  if (!trimmed) {
    return null
  }

  const fullMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (fullMatch) {
    const year = Number(fullMatch[1])
    const month = Number(fullMatch[2])
    const day = Number(fullMatch[3])
    const start = new Date(Date.UTC(year, month - 1, day))
    if (Number.isNaN(start.getTime())) {
      return null
    }
    return { start, end: start }
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(trimmed)
  if (monthMatch) {
    const year = Number(monthMatch[1])
    const month = Number(monthMatch[2])
    const start = new Date(Date.UTC(year, month - 1, 1))
    const end = new Date(Date.UTC(year, month, 0))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null
    }
    return { start, end }
  }

  const yearMatch = /^(\d{4})$/.exec(trimmed)
  if (yearMatch) {
    const year = Number(yearMatch[1])
    const start = new Date(Date.UTC(year, 0, 1))
    const end = new Date(Date.UTC(year, 11, 31))
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null
    }
    return { start, end }
  }

  return null
}

function hasFutureStartDate(
  entry: PlanToWatchSnapshotEntry,
  today: Date
): boolean {
  if (!entry.startDate) {
    return false
  }

  const bounds = parseStartDateBounds(entry.startDate)
  if (!bounds) {
    return false
  }

  return bounds.end.getTime() >= today.getTime()
}

function sortUpcoming(
  entries: PlanToWatchSnapshotEntry[]
): PlanToWatchSnapshotEntry[] {
  const today = startOfUtcDay(new Date())
  const dated: PlanToWatchSnapshotEntry[] = []
  const undated: PlanToWatchSnapshotEntry[] = []

  for (const entry of entries) {
    if (hasFutureStartDate(entry, today)) {
      dated.push(entry)
    } else {
      undated.push(entry)
    }
  }

  dated.sort((a, b) => {
    const aStart = parseStartDateBounds(a.startDate!)!.start.getTime()
    const bStart = parseStartDateBounds(b.startDate!)!.start.getTime()
    if (aStart !== bStart) {
      return aStart - bStart
    }
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  })

  undated.sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  )

  return [...dated, ...undated]
}

type PtwSectionKind = 'airing' | 'upcoming' | 'aired'

function formatTrailingMeta(
  entry: PlanToWatchSnapshotEntry,
  kind: PtwSectionKind
): string {
  const parts: string[] = []

  if (entry.startDate) {
    parts.push(entry.startDate)
  }

  if (kind !== 'upcoming' && entry.numEpisodes) {
    parts.push(`${entry.numEpisodes} ep`)
  }

  return parts.join(' · ')
}

function PtwSection({
  title,
  kind,
  entries,
}: {
  title: string
  kind: PtwSectionKind
  entries: PlanToWatchSnapshotEntry[]
}) {
  if (entries.length === 0) {
    return null
  }

  return (
    <section className="stack">
      <h2>{title}</h2>
      <div className="panel show-list">
        {entries.map((entry) => {
          const meta = formatTrailingMeta(entry, kind)
          const malUrl = `https://myanimelist.net/anime/${entry.malId}`

          return (
            <article className="show-row" key={entry.malId}>
              <a
                className="show-row-header ptw-row-link"
                href={malUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="show-row-leading">
                  <span className="show-row-title">{entry.title}</span>
                </div>
                {meta ? (
                  <div className="show-row-trailing">
                    <span className="ep-count">{meta}</span>
                  </div>
                ) : null}
              </a>
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
      upcoming: sortUpcoming(
        entries.filter((entry) => entry.status === 'not_yet_aired')
      ),
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
          <PtwListSkeleton />
        ) : !hasEntries ? (
          <div className="panel empty">
            {snapshot?.updatedAt
              ? 'No plan-to-watch entries in the saved snapshot.'
              : 'No snapshot yet. Refresh from MyAnimeList to load your list.'}
          </div>
        ) : (
          <div className="stack ptw-sections">
            <PtwSection title="Airing" kind="airing" entries={sections.airing} />
            <PtwSection title="Not yet aired" kind="upcoming" entries={sections.upcoming} />
            <PtwSection title="Aired" kind="aired" entries={sections.aired} />
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
