'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setStatus('')

    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }
        throw new Error(data.error || 'Login failed')
      }

      router.push('/')
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-wrap">
      <section className="panel login-card stack">
        <div>
          <p className="eyebrow">Anime Episode Checker</p>
          <h1>Admin login</h1>
          <p className="subtitle">
            Manage tracked Crunchyroll and Netflix shows, schedules, and MAL
            links.
          </p>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        {status ? <p className="status error">{status}</p> : null}
      </section>
    </main>
  )
}
