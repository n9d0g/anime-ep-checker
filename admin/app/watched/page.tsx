'use client'

import { useEffect, useMemo, useState } from 'react'
import { TopHeader } from '@/app/components/TopHeader'
import { ShowTitleDisplay } from '@/app/components/ShowTitleDisplay'
import { useHashScrollHighlight } from '@/app/components/useHashScrollHighlight'
import { cacheKeys, readJsonCache, writeJsonCache } from '@/lib/client-cache'
import { PtwListSkeleton } from '@/app/components/ListSkeleton'
import { useToast } from '@/app/components/Toast'
import type { WatchedEntry, WatchedList } from '@/lib/types'
import {
  AnimeDetailsBody,
  type AnimeFact,
} from '@/app/components/AnimeDetailsBody'
import { formatEpisodes, formatMalDate, formatSeason } from '@/lib/anime-format'
import {
  WATCHED_SORT_LABELS,
  filterWatched,
  formatWatchDuration,
  getWatchedStats,
  groupWatched,
  sortWatched,
  type WatchedSort,
} from '@/lib/watched'

const SORTS = Object.keys(WATCHED_SORT_LABELS) as WatchedSort[]

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

function WatchedDetails({ entry }: { entry: WatchedEntry }) {
  const finished = formatMalDate(entry.finishedAt)
  const started = formatMalDate(entry.startedAt)
  const lastUpdated = !entry.finishedAt ? formatMalDate(entry.updatedAt) : null
  const facts: AnimeFact[] = [
    ['Finished', finished],
    ['Started', started && started !== finished ? started : null],
    [
      'Completed',
      lastUpdated ? `~${lastUpdated} (no finish date; last MAL update)` : null,
    ],
    ['Your score', entry.score ? `${entry.score} / 10` : 'Not scored'],
    ['MAL score', entry.meanScore ? entry.meanScore.toFixed(2) : null],
    ['Format', formatEpisodes(entry)],
    ['Aired', formatSeason(entry.season)],
    ['Studio', entry.studios.join(', ') || null],
    ['Genres', entry.genres.join(', ') || null],
    [
      'Rewatched',
      entry.timesRewatched > 0
        ? `${entry.timesRewatched} ${entry.timesRewatched === 1 ? 'time' : 'times'}`
        : null,
    ],
  ]

  return (
    <AnimeDetailsBody
      malId={entry.malId}
      coverUrl={entry.coverUrl}
      facts={facts}
    />
  )
}

export default function WatchedPage() {
  const toast = useToast()
  const [list, setList] = useState<WatchedList | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<WatchedSort>('recent')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const entries = list?.entries ?? []
  useHashScrollHighlight(entries.length > 0)

  const filtered = useMemo(
    () => filterWatched(entries, query),
    [entries, query]
  )
  const groups = useMemo(
    () => groupWatched(sortWatched(filtered, sort), sort),
    [filtered, sort]
  )

  async function loadList(silent: boolean) {
    setRefreshing(true)

    try {
      const response = await fetch('/api/watched', { cache: 'no-store' })
      const data = (await response.json()) as {
        error?: string
        watched?: WatchedList
      }

      if (!response.ok || !data.watched) {
        throw new Error(data.error || 'Failed to load watched list')
      }

      setList(data.watched)
      writeJsonCache(cacheKeys.watched, data.watched)
      if (!silent) {
        toast.success('Refreshed from MyAnimeList.')
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load watched list'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const cached = readJsonCache<WatchedList>(cacheKeys.watched)
    if (cached?.entries?.length) {
      setList(cached)
      setLoading(false)
    }

    // Expand the row a search result links to.
    const match = /^#show-(\d+)$/.exec(window.location.hash)
    if (match) {
      setExpandedId(Number(match[1]))
    }

    void loadList(true)
  }, [])

  return (
    <>
      <TopHeader />

      <main className="container">
        <div className="page-heading page-heading-row">
          <div>
            <h1>Watched</h1>
            <p className="subtitle">
              Completed shows from MyAnimeList, with your scores.
            </p>
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => void loadList(false)}
            disabled={loading || refreshing}
          >
            {refreshing && !loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <PtwListSkeleton />
        ) : entries.length === 0 ? (
          <div className="panel empty">
            No completed shows found on MyAnimeList.
          </div>
        ) : (
          <div className="stack ptw-sections">
            <div className="stack watched-controls">
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by title, studio, or genre"
                aria-label="Filter watched shows"
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
                    {WATCHED_SORT_LABELS[option]}
                  </button>
                ))}
              </div>
              <p className="hint watched-stats">{formatStats(filtered)}</p>
            </div>

            {filtered.length === 0 ? (
              <div className="panel empty">No shows match “{query}”.</div>
            ) : (
              groups.map((group) => (
                <section className="stack" key={group.key}>
                  {group.title ? (
                    <h2>
                      {group.title}{' '}
                      <span className="watched-group-count">
                        {group.entries.length}
                      </span>
                    </h2>
                  ) : null}
                  <div className="panel show-list">
                    {group.entries.map((entry) => {
                      const open = expandedId === entry.malId
                      const date = entry.finishedAt
                        ? formatMalDate(entry.finishedAt, 'short')
                        : entry.updatedAt
                          ? `~${formatMalDate(entry.updatedAt, 'short')}`
                          : null

                      return (
                        <article
                          className={`show-row${open ? ' expanded' : ''}`}
                          id={`show-${entry.malId}`}
                          key={entry.malId}
                        >
                          <button
                            type="button"
                            className="show-row-header"
                            aria-expanded={open}
                            onClick={() =>
                              setExpandedId(open ? null : entry.malId)
                            }
                          >
                            <div className="show-row-leading">
                              <ShowTitleDisplay
                                title={entry.title}
                                titleEnglish={entry.titleEnglish}
                              />
                            </div>
                            <div className="show-row-trailing">
                              {date ? (
                                <span className="ep-count watched-date">
                                  {date}
                                </span>
                              ) : null}
                              <span
                                className={`watched-score${
                                  entry.score ? '' : ' unscored'
                                }`}
                                aria-label={
                                  entry.score
                                    ? `Your score ${entry.score}`
                                    : 'Not scored'
                                }
                              >
                                {entry.score ?? '–'}
                              </span>
                              <span
                                className={`chevron ${open ? 'expanded' : ''}`}
                              >
                                ▼
                              </span>
                            </div>
                          </button>

                          {open ? <WatchedDetails entry={entry} /> : null}
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        )}

        {list?.fetchedAt ? (
          <p className="hint ptw-updated">
            Last updated {new Date(list.fetchedAt).toLocaleString()}
          </p>
        ) : null}
      </main>
    </>
  )
}
