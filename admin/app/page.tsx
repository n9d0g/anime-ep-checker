'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { TopHeader } from '@/app/components/TopHeader'
import { ShowListSkeleton } from '@/app/components/ListSkeleton'
import { buildAnimeDiscussionSearchUrl } from '@/lib/reddit'
import {
  getLastScheduledEpisode,
  isEpisodeInSchedule,
} from '@/lib/schedule'
import {
  emptyShowForm,
  showToForm,
  type Show,
  type ShowFormValues,
  type ShowProvider,
  type ShowSchedule,
  type ShowStateSummary,
} from '@/lib/types'

function providerDotClass(provider: ShowProvider): string {
  if (provider === 'netflix') return 'provider-nf'
  if (provider === 'disney') return 'provider-disney'
  return 'provider-cr'
}

function formScheduleToSchedule(show: ShowFormValues): ShowSchedule {
  return {
    mode: show.schedule.mode,
    startAt: '',
    startEpisode: Number(show.schedule.startEpisode) || 1,
    episodeCount:
      show.schedule.mode === 'ongoing'
        ? null
        : Number(show.schedule.episodeCount) || null,
    premiereBatchSize: Number(show.schedule.premiereBatchSize) || 1,
  }
}

function serializeShows(shows: ShowFormValues[]): string {
  return JSON.stringify(shows)
}

function episodeBadge(
  show: ShowFormValues,
  liveState?: ShowStateSummary
): { label: string; behind: boolean } {
  const schedule = formScheduleToSchedule(show)
  const lastScheduled = getLastScheduledEpisode(schedule)
  const latestOut = liveState?.lastEpisodeNumber
    ? Number(liveState.lastEpisodeNumber)
    : null
  const watched =
    liveState?.watchedEpisode !== undefined &&
    liveState.watchedEpisode !== null &&
    Number.isFinite(liveState.watchedEpisode)
      ? liveState.watchedEpisode
      : null

  if (watched !== null) {
    const label =
      lastScheduled !== null
        ? `Ep ${watched}/${lastScheduled}`
        : `Ep ${watched}`

    return {
      label,
      behind:
        latestOut !== null &&
        Number.isFinite(latestOut) &&
        watched < latestOut,
    }
  }

  if (latestOut !== null && Number.isFinite(latestOut)) {
    const label =
      lastScheduled !== null
        ? `Ep ${latestOut}/${lastScheduled}`
        : `Ep ${latestOut}`

    return { label, behind: false }
  }

  const start = show.schedule.startEpisode || '?'

  if (show.schedule.mode === 'ongoing') {
    return { label: `Ep ${start}`, behind: false }
  }

  return {
    label: `Ep ${start}/${show.schedule.episodeCount || '?'}`,
    behind: false,
  }
}

function getEpisodeBounds(show: ShowFormValues): {
  min: number
  max: number | null
} {
  const schedule = formScheduleToSchedule(show)
  const min = Math.max(1, schedule.startEpisode - 1)
  const max = getLastScheduledEpisode(schedule)
  return { min, max }
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'active' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default function AdminPage() {
  const [shows, setShows] = useState<ShowFormValues[]>([])
  const [baseline, setBaseline] = useState('')
  const [showStates, setShowStates] = useState<Record<string, ShowStateSummary>>(
    {}
  )
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [episodeSaveStatus, setEpisodeSaveStatus] = useState<
    Record<string, 'saving' | 'saved' | 'error' | ''>
  >({})
  const episodeDebounceRefs = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({})
  const [malEditOpen, setMalEditOpen] = useState<Record<string, boolean>>({})

  const isDirty = useMemo(
    () => baseline !== '' && serializeShows(shows) !== baseline,
    [shows, baseline]
  )

  useEffect(() => {
    async function loadData() {
      try {
        const [showsResponse, stateResponse, syncResponse] = await Promise.all([
          fetch('/api/shows'),
          fetch('/api/state'),
          fetch('/api/shows/sync-mal', { method: 'POST' }),
        ])

        const showsData = (await showsResponse.json()) as {
          error?: string
          shows?: Show[]
        }
        const stateData = (await stateResponse.json()) as {
          error?: string
          shows?: Record<string, ShowStateSummary>
        }
        const syncData = (await syncResponse.json()) as {
          error?: string
          shows?: Show[]
          changed?: boolean
          resolvedIds?: string[]
          updatedTitles?: string[]
        }

        if (!showsResponse.ok) {
          throw new Error(showsData.error || 'Failed to load shows')
        }

        if (!stateResponse.ok) {
          throw new Error(stateData.error || 'Failed to load episode state')
        }

        const loadedShows = (
          syncResponse.ok && syncData.shows
            ? syncData.shows
            : showsData.shows ?? []
        ).map(showToForm)

        setShows(loadedShows)
        setBaseline(serializeShows(loadedShows))
        setShowStates(stateData.shows ?? {})

        if (syncResponse.ok && syncData.changed) {
          const parts: string[] = []
          if (syncData.resolvedIds?.length) {
            parts.push('linked MAL IDs')
          }
          if (syncData.updatedTitles?.length) {
            parts.push('synced titles from MAL')
          }
          if (parts.length > 0) {
            setStatusType('success')
            setStatus(`Auto-${parts.join(' and ')}.`)
          }
        } else if (!syncResponse.ok && syncData.error) {
          console.warn('MAL sync skipped:', syncData.error)
        }
      } catch (error) {
        setStatusType('error')
        setStatus(error instanceof Error ? error.message : 'Failed to load shows')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  useEffect(() => {
    return () => {
      for (const timer of Object.values(episodeDebounceRefs.current)) {
        clearTimeout(timer)
      }
    }
  }, [])

  function cardKey(show: ShowFormValues, index: number): string {
    return show.id || `new-${index}`
  }

  function isExpanded(show: ShowFormValues, index: number): boolean {
    const key = cardKey(show, index)
    return expanded[key] ?? false
  }

  function toggleExpanded(show: ShowFormValues, index: number): void {
    const key = cardKey(show, index)
    setExpanded((current) => ({
      ...current,
      [key]: !isExpanded(show, index),
    }))
  }

  function updateShow<K extends keyof ShowFormValues>(
    index: number,
    field: K,
    value: ShowFormValues[K]
  ) {
    setShows((current) =>
      current.map((show, showIndex) =>
        showIndex === index ? { ...show, [field]: value } : show
      )
    )
  }

  function updateSchedule(
    index: number,
    field: keyof ShowFormValues['schedule'],
    value: string
  ) {
    setShows((current) =>
      current.map((show, showIndex) =>
        showIndex === index
          ? {
              ...show,
              schedule: {
                ...show.schedule,
                [field]: value,
              },
            }
          : show
      )
    )
  }

  function addShow() {
    const nextIndex = shows.length
    setShows((current) => [...current, emptyShowForm()])
    setExpanded((current) => ({
      ...current,
      [`new-${nextIndex}`]: true,
    }))
  }

  function removeShow(index: number) {
    setShows((current) => current.filter((_, showIndex) => showIndex !== index))
  }

  async function persistEpisodeNumber(
    showId: string,
    episodeNumber: number
  ): Promise<void> {
    setEpisodeSaveStatus((current) => ({ ...current, [showId]: 'saving' }))

    try {
      const response = await fetch('/api/state', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showId, episodeNumber }),
      })

      const data = (await response.json()) as {
        error?: string
        show?: ShowStateSummary
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update episode')
      }

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
    } catch (error) {
      setEpisodeSaveStatus((current) => ({ ...current, [showId]: 'error' }))
      setStatusType('error')
      setStatus(
        error instanceof Error ? error.message : 'Failed to update episode'
      )
    }
  }

  function adjustEpisode(show: ShowFormValues, delta: number): void {
    if (!show.id) {
      return
    }

    const schedule = formScheduleToSchedule(show)
    const current = Number(showStates[show.id]?.lastEpisodeNumber)
    const base = Number.isFinite(current)
      ? current
      : schedule.startEpisode - 1
    const next = base + delta
    const { min, max } = getEpisodeBounds(show)

    if (next < min) {
      return
    }

    if (max !== null && next > max) {
      return
    }

    if (!isEpisodeInSchedule(schedule, next) && next !== min) {
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
    }, 800)
  }

  async function saveShows() {
    setSaving(true)
    setStatus('')
    setStatusType('')

    try {
      const response = await fetch('/api/shows', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shows }),
      })

      const data = (await response.json()) as {
        error?: string
        shows?: Show[]
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save shows')
      }

      const savedShows = (data.shows ?? []).map(showToForm)
      setShows(savedShows)
      setBaseline(serializeShows(savedShows))
      setStatusType('success')
      setStatus('Saved to GitHub. The checker will use these on the next run.')
    } catch (error) {
      setStatusType('error')
      setStatus(error instanceof Error ? error.message : 'Failed to save shows')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <TopHeader />

      <main className="container">
        <div className="page-heading">
          <h1>Tracked shows</h1>
          <p className="subtitle">
            Weekly schedules in Japan Time (JST). Discord alerts show Eastern
            Time.
          </p>
        </div>

        <section className="stack">
          {loading ? (
            <ShowListSkeleton />
          ) : shows.length === 0 ? (
            <div className="panel empty">No shows yet. Add one below.</div>
          ) : (
            <div className="panel show-list">
              {shows.map((show, index) => {
                const open = isExpanded(show, index)
                const liveState = show.id ? showStates[show.id] : undefined
                const currentEpisode = liveState?.lastEpisodeNumber
                  ? Number(liveState.lastEpisodeNumber)
                  : null
                const { min, max } = getEpisodeBounds(show)
                const discussionUrl =
                  currentEpisode !== null && Number.isFinite(currentEpisode)
                    ? buildAnimeDiscussionSearchUrl(
                        show.title || show.id,
                        currentEpisode,
                        show.redditSearchTitle || undefined
                      )
                    : null
                const malUrl = show.malId
                  ? `https://myanimelist.net/anime/${show.malId}`
                  : null
                const episodeStatus = show.id
                  ? episodeSaveStatus[show.id] ?? ''
                  : ''

                const episodeBadgeInfo = episodeBadge(show, liveState)

                return (
                  <article
                    className={`show-row${open ? ' expanded' : ''}`}
                    key={cardKey(show, index)}
                  >
                    <button
                      type="button"
                      className="show-row-header"
                      aria-expanded={open}
                      onClick={() => toggleExpanded(show, index)}
                    >
                      <div className="show-row-leading">
                        <span
                          className={`provider-dot ${providerDotClass(show.provider)}`}
                          aria-hidden="true"
                        />
                        <span className="show-row-title">
                          {show.title || `Show ${index + 1}`}
                        </span>
                      </div>
                      <div className="show-row-trailing">
                        <span
                          className={`ep-count${
                            episodeBadgeInfo.behind ? ' ep-count-behind' : ''
                          }`}
                        >
                          {episodeBadgeInfo.label}
                        </span>
                        <span className={`chevron ${open ? 'expanded' : ''}`}>
                          ▼
                        </span>
                      </div>
                    </button>

                    {open ? (
                      <div className="show-row-body">
                        <div className="field">
                          <label htmlFor={`title-${index}`}>Title</label>
                          <input
                            id={`title-${index}`}
                            value={show.title}
                            onChange={(event) =>
                              updateShow(index, 'title', event.target.value)
                            }
                            placeholder="One Piece"
                          />
                        </div>

                        <div className="field">
                          <span id={`provider-label-${index}`}>Provider</span>
                          <SegmentedControl
                            ariaLabel="Provider"
                            value={show.provider}
                            options={[
                              { value: 'crunchyroll', label: 'Crunchyroll' },
                              { value: 'netflix', label: 'Netflix' },
                              { value: 'disney', label: 'Disney+' },
                            ]}
                            onChange={(value) =>
                              updateShow(index, 'provider', value as ShowProvider)
                            }
                          />
                        </div>

                        {show.provider === 'crunchyroll' ? (
                          <div className="field">
                            <label htmlFor={`url-${index}`}>
                              Crunchyroll series URL
                            </label>
                            <input
                              id={`url-${index}`}
                              value={show.crunchyrollUrl}
                              onChange={(event) =>
                                updateShow(
                                  index,
                                  'crunchyrollUrl',
                                  event.target.value
                                )
                              }
                              placeholder="https://www.crunchyroll.com/series/..."
                              required
                            />
                          </div>
                        ) : show.provider === 'netflix' ? (
                          <div className="field">
                            <label htmlFor={`netflix-url-${index}`}>
                              Netflix title URL
                            </label>
                            <input
                              id={`netflix-url-${index}`}
                              value={show.netflixUrl}
                              onChange={(event) =>
                                updateShow(index, 'netflixUrl', event.target.value)
                              }
                              placeholder="https://www.netflix.com/title/..."
                              required
                            />
                          </div>
                        ) : (
                          <div className="field">
                            <label htmlFor={`disney-url-${index}`}>
                              Disney+ title URL
                            </label>
                            <input
                              id={`disney-url-${index}`}
                              value={show.disneyUrl}
                              onChange={(event) =>
                                updateShow(index, 'disneyUrl', event.target.value)
                              }
                              placeholder="https://www.disneyplus.com/browse/entity-..."
                              required
                            />
                          </div>
                        )}

                        <div className="field">
                          <span id={`mode-label-${index}`}>Schedule type</span>
                          <SegmentedControl
                            ariaLabel="Schedule type"
                            value={show.schedule.mode}
                            options={[
                              { value: 'finite', label: 'Finite season' },
                              { value: 'ongoing', label: 'Ongoing' },
                            ]}
                            onChange={(value) =>
                              updateSchedule(
                                index,
                                'mode',
                                value as 'finite' | 'ongoing'
                              )
                            }
                          />
                        </div>

                        <div className="field">
                          <label htmlFor={`start-${index}`}>
                            Start date and time (Japan Time / JST)
                          </label>
                          <input
                            id={`start-${index}`}
                            type="datetime-local"
                            value={show.schedule.startAt}
                            onChange={(event) =>
                              updateSchedule(index, 'startAt', event.target.value)
                            }
                            required
                          />
                        </div>

                        <div className="field-row">
                          <div className="field">
                            <label htmlFor={`start-ep-${index}`}>
                              Episode on start date
                            </label>
                            <input
                              id={`start-ep-${index}`}
                              type="number"
                              min="1"
                              value={show.schedule.startEpisode}
                              onChange={(event) =>
                                updateSchedule(
                                  index,
                                  'startEpisode',
                                  event.target.value
                                )
                              }
                              required
                            />
                          </div>

                          {show.id && liveState ? (
                            <div className="field">
                              <label>Current episode</label>
                              <div className="episode-stepper-row">
                                <div
                                  className="episode-stepper"
                                  role="group"
                                  aria-label="Current episode"
                                >
                                  <button
                                    className="episode-stepper-btn"
                                    type="button"
                                    aria-label="Decrease episode"
                                    disabled={
                                      currentEpisode === null ||
                                      currentEpisode <= min
                                    }
                                    onClick={() => adjustEpisode(show, -1)}
                                  >
                                    −
                                  </button>
                                  <span className="episode-stepper-value">
                                    {currentEpisode ?? '—'}
                                  </span>
                                  <button
                                    className="episode-stepper-btn"
                                    type="button"
                                    aria-label="Increase episode"
                                    disabled={
                                      currentEpisode === null ||
                                      (max !== null && currentEpisode >= max)
                                    }
                                    onClick={() => adjustEpisode(show, 1)}
                                  >
                                    +
                                  </button>
                                </div>
                                {episodeStatus ? (
                                  <span
                                    className={`episode-save-status ${episodeStatus}`}
                                  >
                                    {episodeStatus === 'saving'
                                      ? 'Saving…'
                                      : episodeStatus === 'saved'
                                        ? 'Saved'
                                        : 'Error'}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          ) : show.schedule.mode === 'finite' ? (
                            <div className="field">
                              <label htmlFor={`count-${index}`}>
                                Episodes in season
                              </label>
                              <input
                                id={`count-${index}`}
                                type="number"
                                min="1"
                                value={show.schedule.episodeCount}
                                onChange={(event) =>
                                  updateSchedule(
                                    index,
                                    'episodeCount',
                                    event.target.value
                                  )
                                }
                                required
                              />
                            </div>
                          ) : null}
                        </div>

                        {discussionUrl || malUrl ? (
                          <div className="quick-links">
                            {discussionUrl ? (
                              <a
                                className="btn btn-secondary btn-link"
                                href={discussionUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Discussion
                              </a>
                            ) : null}
                            {malUrl ? (
                              <a
                                className="btn btn-secondary btn-link"
                                href={malUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                MAL
                              </a>
                            ) : null}
                          </div>
                        ) : null}

                        {show.id && liveState && show.schedule.mode === 'finite' ? (
                          <div className="field">
                            <label htmlFor={`count-${index}`}>
                              Episodes in season
                            </label>
                            <input
                              id={`count-${index}`}
                              type="number"
                              min="1"
                              value={show.schedule.episodeCount}
                              onChange={(event) =>
                                updateSchedule(
                                  index,
                                  'episodeCount',
                                  event.target.value
                                )
                              }
                              required
                            />
                          </div>
                        ) : null}

                        <details className="disclosure">
                          <summary>More options</summary>
                          <div className="disclosure-body">
                            {show.malId ? (
                              <div className="field">
                                <label>MAL linked</label>
                                <p className="hint">
                                  Linked to MAL ID {show.malId}.{' '}
                                  <button
                                    className="text-btn"
                                    type="button"
                                    onClick={() =>
                                      setMalEditOpen((current) => ({
                                        ...current,
                                        [cardKey(show, index)]: !current[cardKey(show, index)],
                                      }))
                                    }
                                  >
                                    {malEditOpen[cardKey(show, index)]
                                      ? 'Hide'
                                      : 'Edit'}
                                  </button>
                                </p>
                                {malEditOpen[cardKey(show, index)] ? (
                                  <input
                                    id={`mal-${index}`}
                                    type="number"
                                    min="1"
                                    value={show.malId}
                                    onChange={(event) =>
                                      updateShow(index, 'malId', event.target.value)
                                    }
                                    placeholder="39535"
                                  />
                                ) : null}
                              </div>
                            ) : (
                              <div className="field">
                                <label htmlFor={`mal-${index}`}>
                                  MAL anime ID
                                </label>
                                <input
                                  id={`mal-${index}`}
                                  type="number"
                                  min="1"
                                  value={show.malId}
                                  onChange={(event) =>
                                    updateShow(index, 'malId', event.target.value)
                                  }
                                  placeholder="39535"
                                />
                                <p className="hint">
                                  Leave blank to auto-match from the title on load,
                                  or enter the ID from myanimelist.net/anime/
                                  <strong>39535</strong>/...
                                </p>
                              </div>
                            )}

                            <div className="field">
                              <label htmlFor={`reddit-${index}`}>
                                Reddit search title
                              </label>
                              <input
                                id={`reddit-${index}`}
                                value={show.redditSearchTitle}
                                onChange={(event) =>
                                  updateShow(
                                    index,
                                    'redditSearchTitle',
                                    event.target.value
                                  )
                                }
                                placeholder="mushoku_tensei_jobless_reincarnation_season_3"
                              />
                              <p className="hint">
                                Override when r/anime thread slugs do not match
                                the show title.
                              </p>
                            </div>

                            <div className="field">
                              <label htmlFor={`batch-${index}`}>
                                Episodes on premiere day
                              </label>
                              <input
                                id={`batch-${index}`}
                                type="number"
                                min="1"
                                value={show.schedule.premiereBatchSize}
                                onChange={(event) =>
                                  updateSchedule(
                                    index,
                                    'premiereBatchSize',
                                    event.target.value
                                  )
                                }
                                required
                              />
                            </div>
                          </div>
                        </details>

                        <div className="actions">
                          <button
                            className="btn btn-danger"
                            type="button"
                            onClick={() => removeShow(index)}
                          >
                            Remove show
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                )
              })}
            </div>
          )}

          <p className="setup-link">
            <a href="/mal">MAL setup</a>
            <span className="setup-link-sep">·</span>
            One-time OAuth for Discord &quot;Mark watched&quot;
          </p>
        </section>
      </main>

      <div className="sticky-bar">
        <div className="sticky-bar-inner">
          <p className={`status ${statusType}`}>
            {status || `${shows.length} show${shows.length === 1 ? '' : 's'}`}
          </p>
          <div className="sticky-actions">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={addShow}
            >
              Add show
            </button>
            <button
              className="btn"
              type="button"
              onClick={saveShows}
              disabled={saving || loading || !isDirty}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
