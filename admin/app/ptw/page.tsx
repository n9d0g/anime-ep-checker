'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MoveToWatchingModal } from '@/app/components/MoveToWatchingModal'
import { TopHeader } from '@/app/components/TopHeader'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'
import { useHashScrollHighlight } from '@/app/components/useHashScrollHighlight'
import { cacheKeys, readJsonCache, writeJsonCache } from '@/lib/client-cache'
import { PtwListSkeleton } from '@/app/components/ListSkeleton'
import { useToast } from '@/app/components/Toast'
import {
  AnimeDetailsBody,
  type AnimeFact,
} from '@/app/components/AnimeDetailsBody'
import {
  cleanSynopsis,
  formatAirDates,
  formatBroadcast,
  formatCount,
  formatEpisodes,
  formatMalDate,
  formatRating,
  formatSeason,
  formatSource,
} from '@/lib/anime-format'
import type {
  PlanToWatchSnapshot,
  PlanToWatchSnapshotEntry,
  PtwDetails,
  PtwDetailsList,
  ShowFormValues,
} from '@/lib/types'

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

const AIRED_LABELS: Record<PtwSectionKind, string> = {
  airing: 'Airing',
  upcoming: 'Premieres',
  aired: 'Aired',
}

function PtwDetailsPanel({
  entry,
  kind,
  details,
  detailsLoading,
}: {
  entry: PlanToWatchSnapshotEntry
  kind: PtwSectionKind
  details: PtwDetails | undefined
  detailsLoading: boolean
}) {
  const airDates = details
    ? formatAirDates(details.startDate, details.endDate)
    : formatMalDate(entry.startDate)
  const season = details ? formatSeason(details.season) : null
  const added = details ? formatMalDate(details.addedAt) : null

  const facts: AnimeFact[] = [
    [
      'MAL score',
      details?.meanScore
        ? `${details.meanScore.toFixed(2)}${
            details.rank ? ` · ranked #${formatCount(details.rank)}` : ''
          }`
        : null,
    ],
    [
      'Popularity',
      details?.popularity
        ? `#${formatCount(details.popularity)}${
            details.numListUsers
              ? ` · ${formatCount(details.numListUsers)} members`
              : ''
          }`
        : null,
    ],
    [
      'Format',
      details
        ? formatEpisodes(details)
        : entry.numEpisodes
          ? `${entry.numEpisodes} ep`
          : null,
    ],
    [
      AIRED_LABELS[kind],
      airDates && season ? `${airDates} (${season})` : (airDates ?? season),
    ],
    [
      'Broadcast',
      kind === 'aired'
        ? null
        : formatBroadcast(details?.broadcast ?? entry.broadcast),
    ],
    ['Source', details ? formatSource(details.source) : null],
    ['Rating', details ? formatRating(details.rating) : null],
    ['Studio', details?.studios.join(', ') || null],
    ['Genres', details?.genres.join(', ') || null],
    ['Added', added ? `~${added} (last MAL update)` : null],
  ]

  return (
    <AnimeDetailsBody
      malId={entry.malId}
      coverUrl={details?.coverUrl ?? entry.coverUrl}
      facts={facts}
      synopsis={cleanSynopsis(details?.synopsis ?? null)}
      footer={
        !details && detailsLoading ? (
          <p className="anime-details-loading">Loading details from MAL…</p>
        ) : null
      }
    />
  )
}

function PtwSection({
  title,
  kind,
  entries,
  movingMalId,
  onWatch,
  detailsById,
  detailsLoading,
  expandedId,
  onToggle,
}: {
  title: string
  kind: PtwSectionKind
  entries: PlanToWatchSnapshotEntry[]
  movingMalId: number | null
  onWatch: (entry: PlanToWatchSnapshotEntry) => void
  detailsById: Map<number, PtwDetails>
  detailsLoading: boolean
  expandedId: number | null
  onToggle: (malId: number) => void
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
          const open = expandedId === entry.malId

          return (
            <article
              className={`show-row ptw-row${open ? ' expanded' : ''}`}
              id={`show-${entry.malId}`}
              key={entry.malId}
            >
              <div className="show-row-header ptw-row-header">
                <button
                  className="ptw-row-main ptw-row-toggle"
                  type="button"
                  aria-expanded={open}
                  onClick={() => onToggle(entry.malId)}
                >
                  <div className="show-row-leading">
                    <ShowTitleDisplay
                      title={entry.title}
                      titleEnglish={entry.titleEnglish}
                    />
                  </div>
                  <div className="show-row-trailing">
                    {meta ? <span className="ep-count">{meta}</span> : null}
                    <span className={`chevron ${open ? 'expanded' : ''}`}>
                      ▼
                    </span>
                  </div>
                </button>
                <button
                  className="btn btn-secondary ptw-watch-btn"
                  type="button"
                  disabled={movingMalId === entry.malId}
                  onClick={() => onWatch(entry)}
                >
                  Watch
                </button>
              </div>
              {open ? (
                <PtwDetailsPanel
                  entry={entry}
                  kind={kind}
                  details={detailsById.get(entry.malId)}
                  detailsLoading={detailsLoading}
                />
              ) : null}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default function PlanToWatchPage() {
  const toast = useToast()
  const [snapshot, setSnapshot] = useState<PlanToWatchSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const autoEnglishRefreshStarted = useRef(false)
  const [watchEntry, setWatchEntry] = useState<PlanToWatchSnapshotEntry | null>(
    null
  )
  const [moving, setMoving] = useState(false)
  const [details, setDetails] = useState<PtwDetailsList | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  useHashScrollHighlight(Boolean(snapshot?.entries?.length))

  const detailsById = useMemo(
    () => new Map((details?.details ?? []).map((item) => [item.malId, item])),
    [details]
  )

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

    try {
      const response = await fetch('/api/ptw')
      const data = (await response.json()) as {
        error?: string
        planToWatch?: PlanToWatchSnapshot | null
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load plan-to-watch list')
      }

      const next = data.planToWatch ?? null
      setSnapshot(next)
      if (next) {
        writeJsonCache(cacheKeys.ptw, next)
      }

      const needsEnglishTitles =
        (next?.entries?.length ?? 0) > 0 &&
        !next?.entries.some((entry) => entry.titleEnglish?.trim())
      if (needsEnglishTitles && !autoEnglishRefreshStarted.current) {
        autoEnglishRefreshStarted.current = true
        void refreshSnapshot(true)
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to load plan-to-watch list'
      )
    } finally {
      setLoading(false)
    }
  }

  async function loadDetails() {
    setDetailsLoading(true)

    try {
      const response = await fetch('/api/ptw/details', { cache: 'no-store' })
      const data = (await response.json()) as {
        error?: string
        details?: PtwDetailsList
      }

      if (!response.ok || !data.details) {
        throw new Error(data.error || 'Failed to load plan-to-watch details')
      }

      setDetails(data.details)
      writeJsonCache(cacheKeys.ptwDetails, data.details)
    } catch (error) {
      console.warn('Plan-to-watch details unavailable:', error)
    } finally {
      setDetailsLoading(false)
    }
  }

  function toggleExpanded(malId: number) {
    setExpandedId((current) => (current === malId ? null : malId))
  }

  async function refreshSnapshot(silent = false) {
    setRefreshing(true)

    try {
      const response = await fetch('/api/ptw', { method: 'POST' })
      const data = (await response.json()) as {
        error?: string
        planToWatch?: PlanToWatchSnapshot
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to refresh plan-to-watch list')
      }

      const refreshed = data.planToWatch ?? null
      setSnapshot(refreshed)
      if (refreshed) {
        writeJsonCache(cacheKeys.ptw, refreshed)
      }
      if (!silent) {
        toast.success('Refreshed from MyAnimeList.')
      }
    } catch (error) {
      if (!silent) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to refresh plan-to-watch list'
        )
      }
    } finally {
      setRefreshing(false)
    }
  }

  function removeEntryFromSnapshot(malId: number) {
    setSnapshot((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        entries: current.entries.filter((entry) => entry.malId !== malId),
      }
    })
  }

  async function moveToWatching(values: ShowFormValues) {
    const entry = watchEntry
    if (!entry) {
      return
    }

    setMoving(true)

    try {
      const response = await fetch('/api/ptw/watch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          malId: entry.malId,
          title: entry.title,
          titleEnglish: entry.titleEnglish,
          provider: values.provider,
          crunchyrollUrl: values.crunchyrollUrl,
          netflixUrl: values.netflixUrl,
          disneyUrl: values.disneyUrl,
          schedule: values.schedule,
        }),
      })

      const data = (await response.json()) as {
        error?: string
        malUpdated?: boolean
        workflowTriggered?: boolean
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to move show to watching')
      }

      removeEntryFromSnapshot(entry.malId)
      setWatchEntry(null)

      if (!data.malUpdated) {
        toast.success(
          'Added to watching. MAL status could not be updated — mark it watching there if needed.'
        )
      } else if (data.workflowTriggered) {
        toast.success('Moved to watching. The dashboard will refresh shortly.')
      } else {
        toast.success('Moved to watching.')
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to move show to watching'
      )
    } finally {
      setMoving(false)
    }
  }

  useEffect(() => {
    const cached = readJsonCache<PlanToWatchSnapshot>(cacheKeys.ptw)
    if (cached?.entries?.length) {
      setSnapshot(cached)
      setLoading(false)
    }

    const cachedDetails = readJsonCache<PtwDetailsList>(cacheKeys.ptwDetails)
    if (cachedDetails?.details?.length) {
      setDetails(cachedDetails)
    }

    // Expand the row a search result links to.
    const match = /^#show-(\d+)$/.exec(window.location.hash)
    if (match) {
      setExpandedId(Number(match[1]))
    }

    void loadSnapshot()
    void loadDetails()
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
              MyAnimeList plan-to-watch list grouped by airing status. Tap a
              show for details.
            </p>
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              void refreshSnapshot(false)
              void loadDetails()
            }}
            disabled={loading || refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

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
            <PtwSection
              title="Airing"
              kind="airing"
              entries={sections.airing}
              movingMalId={moving ? (watchEntry?.malId ?? null) : null}
              onWatch={setWatchEntry}
              detailsById={detailsById}
              detailsLoading={detailsLoading}
              expandedId={expandedId}
              onToggle={toggleExpanded}
            />
            <PtwSection
              title="Not yet aired"
              kind="upcoming"
              entries={sections.upcoming}
              movingMalId={moving ? (watchEntry?.malId ?? null) : null}
              onWatch={setWatchEntry}
              detailsById={detailsById}
              detailsLoading={detailsLoading}
              expandedId={expandedId}
              onToggle={toggleExpanded}
            />
            <PtwSection
              title="Aired"
              kind="aired"
              entries={sections.aired}
              movingMalId={moving ? (watchEntry?.malId ?? null) : null}
              onWatch={setWatchEntry}
              detailsById={detailsById}
              detailsLoading={detailsLoading}
              expandedId={expandedId}
              onToggle={toggleExpanded}
            />
          </div>
        )}

        {snapshot?.updatedAt ? (
          <p className="hint ptw-updated">
            Last updated {new Date(snapshot.updatedAt).toLocaleString()}
          </p>
        ) : null}
      </main>

      {watchEntry ? (
        <MoveToWatchingModal
          entry={watchEntry}
          submitting={moving}
          onCancel={() => {
            if (!moving) {
              setWatchEntry(null)
            }
          }}
          onSubmit={(values) => void moveToWatching(values)}
        />
      ) : null}
    </>
  )
}
