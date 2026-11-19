'use client'

import { useMemo, useState } from 'react'
import {
  AnimeFactList,
  AnimeFacts,
  AnimeSheet,
  type AnimeFact,
} from '@/app/components/AnimeSheet'
import { ListGroup, ShowList } from '@/app/components/ListGroup'
import { ListRow, ListRowMetaText } from '@/app/components/ListRow'
import { SegmentedControl } from '@/app/components/SegmentedControl'
import { PtwListSkeleton } from '@/app/components/ListSkeleton'
import { SheetSection } from '@/app/components/Sheet'
import { useToast } from '@/app/components/Toast'
import { useAniListMedia } from '@/app/components/useAniListMedia'
import { useCachedResource } from '@/app/components/useCachedResource'
import { useHashScrollHighlight } from '@/app/components/useHashScrollHighlight'
import { apiFetch } from '@/lib/api-fetch'
import {
  cleanSynopsis,
  formatAirDates,
  formatCount,
  formatEpisodes,
  formatMalDate,
  formatRating,
  formatSeason,
  formatSource,
} from '@/lib/anime-format'
import { cacheKeys } from '@/lib/client-cache'
import { malIdFromElementId } from '@/lib/hash-highlight'
import { formatUpdatedAgo } from '@/lib/time'
import type { WatchedEntry, WatchedList } from '@/lib/types'
import {
  WATCHED_SORT_LABELS,
  filterWatched,
  formatWatchDuration,
  getWatchedStats,
  groupWatched,
  sortWatched,
  type WatchedSort,
} from '@/lib/watched'
import { FieldDescription } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/components/ui/utils'

const SORTS = Object.keys(WATCHED_SORT_LABELS) as WatchedSort[]

async function fetchWatchedList(): Promise<WatchedList> {
  const errorMessage = 'Failed to load watched list'
  const data = await apiFetch<{ watched?: WatchedList }>('/api/watched', {
    errorMessage,
  })
  if (!data.watched) {
    throw new Error(errorMessage)
  }
  return data.watched
}

function formatStats(entries: WatchedEntry[]): string {
  const stats = getWatchedStats(entries)
  const parts = [
    `${stats.count.toLocaleString()} ${stats.count === 1 ? 'show' : 'shows'}`,
  ]
  if (stats.meanScore !== null) {
    parts.push(`avg score ${stats.meanScore.toFixed(2)}`)
  }
  if (stats.episodes > 0) {
    parts.push(`${stats.episodes.toLocaleString()} episodes`)
  }
  if (stats.watchSeconds > 0) {
    parts.push(`~${formatWatchDuration(stats.watchSeconds)} watched`)
  }
  return parts.join(' · ')
}

// A Watched show in its sheet: your list entry, then everything MAL has.
function WatchedSheet({
  entry,
  producers,
  onClose,
}: {
  entry: WatchedEntry
  /** From AniList; empty until it answers. */
  producers: string[]
  onClose: () => void
}) {
  const finished = formatMalDate(entry.finishedAt)
  const started = formatMalDate(entry.startedAt)
  const lastUpdated = !entry.finishedAt ? formatMalDate(entry.updatedAt) : null
  const yours: AnimeFact[] = [
    ['Started', started],
    ['Finished', finished],
    [
      'Completed',
      lastUpdated ? `~${lastUpdated} (no finish date; last MAL update)` : null,
    ],
    [
      'Rewatched',
      entry.timesRewatched > 0
        ? `${entry.timesRewatched} ${entry.timesRewatched === 1 ? 'time' : 'times'}`
        : null,
    ],
  ]
  const show: AnimeFact[] = [
    ['Format', formatEpisodes(entry)],
    ['Season', formatSeason(entry.season)],
    ['Aired', formatAirDates(entry.startDate ?? null, entry.endDate ?? null)],
    ['Studio', entry.studios.join(', ') || null],
    ['Producers', producers.join(', ') || null],
    ['Source', formatSource(entry.source ?? null)],
    ['Rating', formatRating(entry.rating ?? null)],
    ['Genres', entry.genres.join(', ') || null],
    [
      'MAL score',
      entry.meanScore
        ? `${entry.meanScore.toFixed(2)}${
            entry.rank ? ` · ranked #${formatCount(entry.rank)}` : ''
          }${entry.popularity ? ` · #${formatCount(entry.popularity)} popular` : ''}`
        : null,
    ],
  ]

  return (
    <AnimeSheet
      title={entry.title}
      titleEnglish={entry.titleEnglish}
      coverUrl={entry.coverUrl}
      meta={entry.score ? `★ ${entry.score} / 10` : 'Not scored'}
      onClose={onClose}
    >
      <SheetSection title="Your list">
        <AnimeFactList facts={yours} />
      </SheetSection>
      <SheetSection title="About">
        <AnimeFacts
          malId={entry.malId}
          title={entry.title}
          facts={show}
          synopsis={cleanSynopsis(entry.synopsis ?? null)}
        />
      </SheetSection>
    </AnimeSheet>
  )
}

function WatchedRow({
  entry,
  bannerUrl,
  onOpen,
}: {
  entry: WatchedEntry
  bannerUrl: string | null | undefined
  onOpen: () => void
}) {
  const date = entry.finishedAt
    ? formatMalDate(entry.finishedAt, 'short')
    : entry.updatedAt
      ? `~${formatMalDate(entry.updatedAt, 'short')}`
      : null
  return (
    <ListRow
      id={`show-${entry.malId}`}
      title={entry.title}
      titleEnglish={entry.titleEnglish}
      bannerUrl={bannerUrl}
      coverUrl={entry.coverUrl}
      meta={
        <ListRowMetaText>
          {[date ? `Finished ${date}` : null, formatEpisodes(entry)]
            .filter(Boolean)
            .join(' · ')}
        </ListRowMetaText>
      }
      trailing={
        <span
          className={cn(
            'min-w-7 rounded-md border border-border bg-accent px-[0.4rem] py-[0.1rem] text-center text-[0.8rem] font-semibold tabular-nums',
            !entry.score && 'font-medium text-(--hint)'
          )}
          aria-label={entry.score ? `Your score ${entry.score}` : 'Not scored'}
        >
          {entry.score ? `★ ${entry.score}` : '–'}
        </span>
      }
      onOpen={onOpen}
    />
  )
}

export default function WatchedPage() {
  const toast = useToast()
  const watched = useCachedResource({
    cacheKey: cacheKeys.watched,
    fetch: fetchWatchedList,
    isUsable: (cached: WatchedList) => Boolean(cached.entries?.length),
  })
  const list = watched.data
  const loading = watched.loading
  const refreshing = watched.fetching
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<WatchedSort>('recent')
  const [openId, setOpenId] = useState<number | null>(null)
  const entries = list?.entries ?? []
  const openEntry = entries.find((entry) => entry.malId === openId)
  const aniList = useAniListMedia(entries.map((entry) => entry.malId))
  // Open the show a search result links to.
  useHashScrollHighlight((elementId) => {
    const malId = malIdFromElementId(elementId)
    if (malId !== null) {
      setOpenId(malId)
    }
  })

  const filtered = useMemo(
    () => filterWatched(entries, query),
    [entries, query]
  )
  const groups = useMemo(
    () => groupWatched(sortWatched(filtered, sort), sort),
    [filtered, sort]
  )

  async function refreshList() {
    if (await watched.reload()) {
      toast.success('Refreshed from MyAnimeList.')
    }
  }

  return (
    <main className="container">
      <div className="page-heading page-heading-row">
        <div>
          <h1>Watched</h1>
          <p className="subtitle">
            Completed shows from MyAnimeList, with your scores.
          </p>
        </div>
        <Button
          variant="outline"
          type="button"
          onClick={() => void refreshList()}
          disabled={loading || refreshing}
        >
          {refreshing && !loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {loading ? (
        <PtwListSkeleton />
      ) : entries.length === 0 ? (
        <div className="panel empty">
          No completed shows found on MyAnimeList.
        </div>
      ) : (
        <div className="stack">
          <div className="stack">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by title, studio, or genre"
              aria-label="Filter watched shows"
            />
            <SegmentedControl
              ariaLabel="Sort by"
              value={sort}
              options={SORTS.map((option) => ({
                value: option,
                label: WATCHED_SORT_LABELS[option],
              }))}
              onChange={setSort}
            />
            <FieldDescription>{formatStats(filtered)}</FieldDescription>
          </div>

          {filtered.length === 0 ? (
            <div className="panel empty">No shows match “{query}”.</div>
          ) : (
            groups.map((group, index) =>
              group.title ? (
                <ListGroup
                  key={`${sort}:${group.key}`}
                  title={group.title}
                  count={group.entries.length}
                  defaultOpen={index === 0}
                  forceOpen={Boolean(query.trim())}
                >
                  {group.entries.map((entry) => (
                    <WatchedRow
                      key={entry.malId}
                      entry={entry}
                      bannerUrl={aniList(entry.malId)?.bannerUrl}
                      onOpen={() => setOpenId(entry.malId)}
                    />
                  ))}
                </ListGroup>
              ) : (
                <ShowList key={group.key}>
                  {group.entries.map((entry) => (
                    <WatchedRow
                      key={entry.malId}
                      entry={entry}
                      bannerUrl={aniList(entry.malId)?.bannerUrl}
                      onOpen={() => setOpenId(entry.malId)}
                    />
                  ))}
                </ShowList>
              )
            )
          )}
        </div>
      )}

      {list?.fetchedAt ? (
        <FieldDescription>{formatUpdatedAgo(list.fetchedAt)}</FieldDescription>
      ) : null}

      {openEntry ? (
        <WatchedSheet
          entry={openEntry}
          producers={aniList(openEntry.malId)?.producers ?? []}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </main>
  )
}
