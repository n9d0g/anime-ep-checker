'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  emptyShowForm,
  showToForm,
  type Show,
  type ShowFormValues,
} from '@/lib/types'

export default function AdminPage() {
  const router = useRouter()
  const [shows, setShows] = useState<ShowFormValues[]>([])
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState<'success' | 'error' | ''>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadShows() {
      try {
        const response = await fetch('/api/shows')
        if (!response.ok) {
          throw new Error('Failed to load shows')
        }
        const data = (await response.json()) as { shows?: Show[] }
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
    setShows((current) => [...current, emptyShowForm()])
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
    <main className="container">
      <header className="header">
        <div>
          <p className="eyebrow">Anime Episode Checker</p>
          <h1>Tracked shows</h1>
          <p className="subtitle">
            Set a weekly schedule. Episodes drop every 7 days from the start
            date, with optional multi-episode premieres.
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={logout}>
          Log out
        </button>
      </header>

      <section className="stack">
        {loading ? (
          <p className="status">Loading shows...</p>
        ) : shows.length === 0 ? (
          <div className="panel empty">No shows yet. Add one below.</div>
        ) : (
          <div className="show-list">
            {shows.map((show, index) => (
              <article
                className="panel show-card"
                key={show.id || `new-${index}`}
              >
                <h2>{show.title || `Show ${index + 1}`}</h2>

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
                  <label htmlFor={`url-${index}`}>Crunchyroll series URL</label>
                  <input
                    id={`url-${index}`}
                    value={show.crunchyrollUrl}
                    onChange={(event) =>
                      updateShow(index, 'crunchyrollUrl', event.target.value)
                    }
                    placeholder="https://www.crunchyroll.com/series/..."
                    required
                  />
                </div>

                <div className="field">
                  <label htmlFor={`mode-${index}`}>Schedule type</label>
                  <select
                    id={`mode-${index}`}
                    value={show.schedule.mode}
                    onChange={(event) =>
                      updateSchedule(
                        index,
                        'mode',
                        event.target.value as 'finite' | 'ongoing'
                      )
                    }
                  >
                    <option value="finite">Finite season</option>
                    <option value="ongoing">Ongoing (no end)</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor={`start-${index}`}>
                    Start date and time (Eastern Time)
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

                <div className="field">
                  <label htmlFor={`start-ep-${index}`}>
                    Episode number on start date
                  </label>
                  <input
                    id={`start-ep-${index}`}
                    type="number"
                    min="1"
                    value={show.schedule.startEpisode}
                    onChange={(event) =>
                      updateSchedule(index, 'startEpisode', event.target.value)
                    }
                    required
                  />
                </div>

                {show.schedule.mode === 'finite' ? (
                  <div className="field">
                    <label htmlFor={`count-${index}`}>Episodes in season</label>
                    <input
                      id={`count-${index}`}
                      type="number"
                      min="1"
                      value={show.schedule.episodeCount}
                      onChange={(event) =>
                        updateSchedule(index, 'episodeCount', event.target.value)
                      }
                      required
                    />
                  </div>
                ) : null}

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
                      updateSchedule(index, 'premiereBatchSize', event.target.value)
                    }
                    required
                  />
                </div>

                <div className="actions">
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => removeShow(index)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="actions">
          <button className="btn btn-secondary" type="button" onClick={addShow}>
            Add show
          </button>
          <button className="btn" type="button" onClick={saveShows} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>

        {status ? <p className={`status ${statusType}`}>{status}</p> : null}
      </section>
    </main>
  )
}
