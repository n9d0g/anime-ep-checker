'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

function emptyShow() {
  return {
    id: '',
    title: '',
    crunchyrollUrl: '',
    seriesId: '',
    expectedDropAt: '',
  }
}

function toDatetimeLocalValue(isoValue) {
  if (!isoValue) return ''
  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return ''

  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromDatetimeLocalValue(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

export default function AdminPage() {
  const router = useRouter()
  const [shows, setShows] = useState([])
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function loadShows() {
      try {
        const response = await fetch('/api/shows')
        if (!response.ok) {
          throw new Error('Failed to load shows')
        }
        const data = await response.json()
        setShows((data.shows ?? []).map((show) => ({
          ...show,
          expectedDropAt: toDatetimeLocalValue(show.expectedDropAt),
        })))
      } catch (error) {
        setStatusType('error')
        setStatus(error.message)
      } finally {
        setLoading(false)
      }
    }

    loadShows()
  }, [])

  function updateShow(index, field, value) {
    setShows((current) =>
      current.map((show, showIndex) =>
        showIndex === index ? { ...show, [field]: value } : show
      )
    )
  }

  function addShow() {
    setShows((current) => [...current, emptyShow()])
  }

  function removeShow(index) {
    setShows((current) => current.filter((_, showIndex) => showIndex !== index))
  }

  async function saveShows() {
    setSaving(true)
    setStatus('')
    setStatusType('')

    try {
      const payload = shows.map((show) => ({
        ...show,
        expectedDropAt: fromDatetimeLocalValue(show.expectedDropAt),
      }))

      const response = await fetch('/api/shows', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shows: payload }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save shows')
      }

      setShows((data.shows ?? []).map((show) => ({
        ...show,
        expectedDropAt: toDatetimeLocalValue(show.expectedDropAt),
      })))
      setStatusType('success')
      setStatus('Saved to GitHub. The checker will use these on the next run.')
    } catch (error) {
      setStatusType('error')
      setStatus(error.message)
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
            Add Crunchyroll series and set when the next episode is supposed to drop.
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
              <article className="panel show-card" key={show.id || `new-${index}`}>
                <h2>{show.title || `Show ${index + 1}`}</h2>

                <div className="field">
                  <label htmlFor={`title-${index}`}>Title</label>
                  <input
                    id={`title-${index}`}
                    value={show.title}
                    onChange={(event) => updateShow(index, 'title', event.target.value)}
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
                  <label htmlFor={`drop-${index}`}>Expected next drop</label>
                  <input
                    id={`drop-${index}`}
                    type="datetime-local"
                    value={show.expectedDropAt}
                    onChange={(event) =>
                      updateShow(index, 'expectedDropAt', event.target.value)
                    }
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
