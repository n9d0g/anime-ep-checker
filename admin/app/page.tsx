'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  emptyShowForm,
  showToForm,
  type Show,
  type ShowFormValues,
  type ShowProvider,
} from '@/lib/types'
import { providerLabel } from '@/lib/shows'

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

function scheduleSummary(show: ShowFormValues): string {
  const start = show.schedule.startAt
    ? new Date(show.schedule.startAt).toLocaleString('en-US', {
        timeZone: 'Asia/Tokyo',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'No start time'

  if (show.schedule.mode === 'ongoing') {
    return `Ep ${show.schedule.startEpisode || '?'} · ${start} JST · ongoing`
  }

  return `Ep ${show.schedule.startEpisode || '?'}-${show.schedule.episodeCount || '?'} · ${start} JST`
}

export default function AdminPage() {
  const router = useRouter()
  const [shows, setShows] = useState<ShowFormValues[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadShows() {
      try {
        const response = await fetch('/api/shows')
        const data = (await response.json()) as {
          error?: string
          shows?: Show[]
        }

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load shows')
        }

        setShows((data.shows ?? []).map(showToForm))
      } catch (error) {
        setStatusType('error')
        setStatus(error instanceof Error ? error.message : 'Failed to load shows')
      } finally {
        setLoading(false)
      }
    }

    loadShows()
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

      setShows((data.shows ?? []).map(showToForm))
      setStatusType('success')
      setStatus('Saved to GitHub. The checker will use these on the next run.')
    } catch (error) {
      setStatusType('error')
      setStatus(error instanceof Error ? error.message : 'Failed to save shows')
    } finally {
      setSaving(false)
    }
  }

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <main className="container">
        <header className="header">
          <div>
            <p className="eyebrow">Anime Episode Checker</p>
            <h1>Tracked shows</h1>
            <p className="subtitle">
              Weekly schedules in Japan Time (JST). Discord alerts show Eastern
              Time.
            </p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={logout}>
            Log out
          </button>
        </header>

        <section className="stack">
          <div className="panel integrations-panel">
            <div>
              <h2>Integrations</h2>
              <p className="subtitle" style={{ marginTop: '0.25rem' }}>
                MAL powers the Discord &quot;Mark watched&quot; button and
                watching dashboard.
              </p>
            </div>
            <a className="btn btn-secondary" href="/mal">
              MAL setup
            </a>
          </div>

          {loading ? (
            <p className="status">Loading shows...</p>
          ) : shows.length === 0 ? (
            <div className="panel empty">No shows yet. Add one below.</div>
          ) : (
            <div className="show-list">
              {shows.map((show, index) => {
                const open = isExpanded(show, index)
                const chipProviderLabel = providerLabel(show.provider)

                return (
                  <article className="panel show-card" key={cardKey(show, index)}>
                    <button
                      type="button"
                      className="show-card-header"
                      aria-expanded={open}
                      onClick={() => toggleExpanded(show, index)}
                    >
                      <div className="show-card-summary">
                        <span className="show-card-title">
                          {show.title || `Show ${index + 1}`}
                        </span>
                        <div className="show-card-meta">
                          <span className="chip">{chipProviderLabel}</span>
                          <span className="chip chip-muted">
                            {show.schedule.mode === 'ongoing'
                              ? 'Ongoing'
                              : 'Finite'}
                          </span>
                          <span>{scheduleSummary(show)}</span>
                        </div>
                      </div>
                      <span className={`chevron ${open ? 'expanded' : ''}`}>
                        ▼
                      </span>
                    </button>

                    {open ? (
                      <div className="show-card-body">
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

                          {show.schedule.mode === 'finite' ? (
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

                        <details className="disclosure">
                          <summary>More options</summary>
                          <div className="disclosure-body">
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
                                From the MAL URL: myanimelist.net/anime/
                                <strong>39535</strong>/...
                              </p>
                            </div>

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
              disabled={saving || loading}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
