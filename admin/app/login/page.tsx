'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-fetch'
import { Field } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
      await apiFetch('/api/auth', {
        method: 'POST',
        json: { password },
        errorMessage: 'Login failed',
      })

      router.push('/')
      router.refresh()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <Card asChild className="grid w-[min(420px,100%)] gap-[0.85rem]">
        <section>
          <h1>Sign in</h1>

          <form className="grid gap-[0.85rem]" onSubmit={handleSubmit}>
            <Field>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            <Button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          {status ? (
            <p className="min-h-5 text-[0.8rem] text-destructive">{status}</p>
          ) : null}
        </section>
      </Card>
    </main>
  )
}
