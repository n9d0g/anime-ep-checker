'use client'

import { useMemo, useRef, useState } from 'react'
import {
  AnimeFacts,
  AnimeSheet,
  type AnimeFact,
} from '@/app/components/AnimeSheet'
import { ListGroup } from '@/app/components/ListGroup'
import { ListRow } from '@/app/components/ListRow'
import { MoveToWatchingSheet } from '@/app/components/MoveToWatchingSheet'
import { SheetSection } from '@/app/components/Sheet'
import { useCachedResource } from '@/app/components/useCachedResource'
import { useHashScrollHighlight } from '@/app/components/useHashScrollHighlight'
import { apiErrorMessage, apiFetch } from '@/lib/api-fetch'
import { cacheKeys, withoutPtwEntry } from '@/lib/client-cache'
import { malIdFromElementId } from '@/lib/hash-highlight'
import { matchSearchQuery } from '@/lib/search'
import { searchIndex } from '@/lib/search-index-store'
import { PtwListSkeleton } from '@/app/components/ListSkeleton'
import { useToast } from '@/app/components/Toast'
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
} from '@shared/types'
import type { PtwDetails, PtwDetailsList, ShowFormValues } from '@/lib/types'
import { formatUpdatedAgo } from '@/lib/time'
import { moveToWatchingMessage, requestMoveToWatching } from '@/lib/ptw-move'

async function fetchPtwSnapshot(): Promise<PlanToWatchSnapshot | null> {
  const data = await apiFetch<{ planToWatch?: PlanToWatchSnapshot | null }>(
    '/api/ptw',
    { errorMessage: 'Failed to load plan-to-watch list' }
  )
  return data.planToWatch ?? null
}

async function fetchPtwDetails(): Promise<PtwDetailsList> {
  const errorMessage = 'Failed to load plan-to-watch details'
  const data = await apiFetch<{ details?: PtwDetailsList }>(
    '/api/ptw/details',
    { errorMessage }
  )
  if (!data.details) {
    throw new Error(errorMessage)
  }
  return data.details
}

function needsEnglishTitles(snapshot: PlanToWatchSnapshot | null): boolean {
  return (
    (snapshot?.entries?.length ?? 0) > 0 &&
    !snapshot?.entries.some((entry) => entry.titleEnglish?.trim())
  )
}

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

  const startDate = formatMalDate(entry.startDate)
  if (startDate) {
    parts.push(startDate)
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

const SECTION_TITLES: Record<PtwSectionKind, string> = {
  airing: 'Airing',
  upcoming: 'Not yet aired',
  aired: 'Aired',
}

type PtwSort = 'start' | 'score' | 'title'

const SORT_LABELS: Record<PtwSort, string> = {
  start: 'Start date',
  score: 'Score',
  title: 'Title',
}

const SORTS = Object.keys(SORT_LABELS) as PtwSort[]

function compareTitles(
  a: PlanToWatchSnapshotEntry,
  b: PlanToWatchSnapshotEntry
): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
}

function sortSection(
  entries: PlanToWatchSnapshotEntry[],
  kind: PtwSectionKind,
  sort: PtwSort,
  detailsById: Map<number, PtwDetails>
): PlanToWatchSnapshotEntry[] {
  if (sort === 'title') {
    return [...entries].sort(compareTitles)
  }
  if (sort === 'score') {
    const score = (entry: PlanToWatchSnapshotEntry) =>
      detailsById.get(entry.malId)?.meanScore ?? -1
    return [...entries].sort(
      (a, b) => score(b) - score(a) || compareTitles(a, b)
    )
  }
  return kind === 'upcoming' ? sortUpcoming(entries) : entries
}

/** Title, English title, or (once details load) a studio or genre. */
function matchesFilter(
  entry: PlanToWatchSnapshotEntry,
  details: PtwDetails | undefined,
  query: string
): boolean {
  return (
    matchSearchQuery(query, entry) ||
    [...(details?.studios ?? []), ...(details?.genres ?? [])].some((name) =>
      matchSearchQuery(query, { title: name })
    )
  )
}

// A Plan to watch show in its sheet: Move to Watching, then MAL's details.
function PtwSheet({
  entry,
  kind,
  details,
  detailsLoading,
  onMove,
  onClose,
}: {
  entry: PlanToWatchSnapshotEntry
  kind: PtwSectionKind
  details: PtwDetails | undefined
  detailsLoading: boolean
  onMove: () => void
  onClose: () => void
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
    <AnimeSheet
      title={entry.title}
      titleEnglish={entry.titleEnglish}
      coverUrl={details?.coverUrl ?? entry.coverUrl}
      meta={formatTrailingMeta(entry, kind) || SECTION_TITLES[kind]}
      onClose={onClose}
    >
      <SheetSection title="Manage">
        <div className="actions sheet-manage">
          <button className="btn" type="button" onClick={onMove}>
            Move to Watching
          </button>
        </div>
      </SheetSection>
      <SheetSection title="About">
        <AnimeFacts
          malId={entry.malId}
          title={entry.title}
          facts={facts}
          synopsis={cleanSynopsis(details?.synopsis ?? null)}
          footer={
            !details && detailsLoading ? (
              <p className="anime-details-loading">Loading details from MAL…</p>
            ) : null
          }
        />
      </SheetSection>
    </AnimeSheet>
  )
}

export default function PlanToWatchPage() {
  const toast = useToast()
  const autoEnglishRefreshStarted = useRef(false)
  const ptw = useCachedResource({
    cacheKey: cacheKeys.ptw,
    fetch: fetchPtwSnapshot,
    isUsable: (cached: PlanToWatchSnapshot) => Boolean(cached.entries?.length),
    onLoad: (next) => {
      if (needsEnglishTitles(next) && !autoEnglishRefreshStarted.current) {
        autoEnglishRefreshStarted.current = true
        void refreshSnapshot(true)
      }
    },
  })
  const ptwDetails = useCachedResource({
    cacheKey: cacheKeys.ptwDetails,
    fetch: fetchPtwDetails,
    isUsable: (cached: PtwDetailsList) => Boolean(cached.details?.length),
    onError: (error) => {
      console.warn('Plan-to-watch details unavailable:', error)
    },
  })
  const snapshot = ptw.data
  const loading = ptw.loading
  const details = ptwDetails.data
  const detailsLoading = ptwDetails.loading
  const [refreshing, setRefreshing] = useState(false)
  const [watchEntry, setWatchEntry] = useState<PlanToWatchSnapshotEntry | null>(
    null
  )
  const [moving, setMoving] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<PtwSort>('start')

  // Open the show a search result links to.
  useHashScrollHighlight((elementId) => {
    const malId = malIdFromElementId(elementId)
    if (malId !== null) {
      setOpenId(malId)
    }
  })

  const detailsById = useMemo(
    () => new Map((details?.details ?? []).map((item) => [item.malId, item])),
    [details]
  )

  const allEntries = useMemo(() => snapshot?.entries ?? [], [snapshot])
  const filtering = query.trim() !== ''
  const sections = useMemo(() => {
    const entries = filtering
      ? allEntries.filter((entry) =>
          matchesFilter(entry, detailsById.get(entry.malId), query.trim())
        )
      : allEntries
    const section = (kind: PtwSectionKind, status: string) => ({
      kind,
      entries: sortSection(
        entries.filter((entry) => entry.status === status),
        kind,
        sort,
        detailsById
      ),
    })
    return [
      section('airing', 'currently_airing'),
      section('upcoming', 'not_yet_aired'),
      section('aired', 'finished_airing'),
    ].filter((group) => group.entries.length > 0)
  }, [allEntries, detailsById, filtering, query, sort])

  const open = useMemo(() => {
    for (const section of sections) {
      const entry = section.entries.find((item) => item.malId === openId)
      if (entry) {
        return { entry, kind: section.kind }
      }
    }
    const entry = allEntries.find((item) => item.malId === openId)
    return entry ? { entry, kind: 'aired' as PtwSectionKind } : null
  }, [sections, allEntries, openId])

  async function refreshSnapshot(silent = false) {
    setRefreshing(true)

    try {
      const data = await apiFetch<{
        planToWatch?: PlanToWatchSnapshot
        details?: PtwDetailsList
      }>('/api/ptw', {
        method: 'POST',
        errorMessage: 'Failed to refresh plan-to-watch list',
      })

      if (data.details) {
        ptwDetails.set(data.details)
      }

      ptw.set(data.planToWatch ?? null)
      searchIndex.invalidate()
      if (!silent) {
        toast.success('Refreshed from MyAnimeList.')
      }
    } catch (error) {
      if (!silent) {
        toast.error(
          apiErrorMessage(error, 'Failed to refresh plan-to-watch list')
        )
      }
    } finally {
      setRefreshing(false)
    }
  }

  async function moveToWatching(values: ShowFormValues) {
    const entry = watchEntry
    if (!entry) {
      return
    }

    setMoving(true)

    try {
      const data = await requestMoveToWatching(entry, values)

      ptw.update((current) => withoutPtwEntry(current, entry.malId))
      searchIndex.invalidate()
      setWatchEntry(null)
      toast.success(moveToWatchingMessage(data))
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Failed to move show to watching'))
    } finally {
      setMoving(false)
    }
  }

  const hasEntries = allEntries.length > 0

  return (
    <>
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
            <div className="stack watched-controls">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by title, studio, or genre"
                aria-label="Filter plan to watch"
              />
              <div className="segmented" role="group" aria-label="Sort by">
                {SORTS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={sort === option ? 'active' : ''}
                    aria-pressed={sort === option}
                    onClick={() => setSort(option)}
                  >
                    {SORT_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            {sections.length === 0 ? (
              <div className="panel empty">No shows match “{query}”.</div>
            ) : (
              sections.map((section, index) => (
                <ListGroup
                  key={section.kind}
                  title={SECTION_TITLES[section.kind]}
                  count={section.entries.length}
                  defaultOpen={index === 0}
                  forceOpen={filtering}
                >
                  {section.entries.map((entry) => {
                    const meanScore = detailsById.get(entry.malId)?.meanScore
                    return (
                      <ListRow
                        key={entry.malId}
                        id={`show-${entry.malId}`}
                        title={entry.title}
                        titleEnglish={entry.titleEnglish}
                        meta={
                          <span className="show-row-next-drop">
                            {formatTrailingMeta(entry, section.kind)}
                          </span>
                        }
                        trailing={
                          meanScore ? (
                            <span className="ep-count">
                              {meanScore.toFixed(2)}
                            </span>
                          ) : null
                        }
                        onOpen={() => setOpenId(entry.malId)}
                      />
                    )
                  })}
                </ListGroup>
              ))
            )}
          </div>
        )}

        {snapshot?.updatedAt ? (
          <p className="hint ptw-updated">
            {formatUpdatedAgo(snapshot.updatedAt)}
          </p>
        ) : null}
      </main>

      {open && !watchEntry ? (
        <PtwSheet
          entry={open.entry}
          kind={open.kind}
          details={detailsById.get(open.entry.malId)}
          detailsLoading={detailsLoading}
          onMove={() => setWatchEntry(open.entry)}
          onClose={() => setOpenId(null)}
        />
      ) : null}

      {watchEntry ? (
        <MoveToWatchingSheet
          entry={watchEntry}
          submitting={moving}
          onClose={() => setWatchEntry(null)}
          onSubmit={(values) => void moveToWatching(values)}
        />
      ) : null}
    </>
  )
}
