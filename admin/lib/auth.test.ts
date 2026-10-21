import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { NextRequest } from 'next/server'
import {
  COOKIE_NAME,
  getSessionCookieValue,
  isAuthorizedRequest,
} from './auth'

function requestWithCookie(value: string): NextRequest {
  return {
    cookies: {
      get: (name: string) => (name === COOKIE_NAME ? { value } : undefined),
    },
  } as unknown as NextRequest
}

test('session cookie is signed with ADMIN_SESSION_SECRET and never contains the password', () => {
  const previousPassword = process.env.ADMIN_PASSWORD
  const previousSecret = process.env.ADMIN_SESSION_SECRET
  process.env.ADMIN_PASSWORD = 'pw-test-password'
  process.env.ADMIN_SESSION_SECRET = 'secret-test-signing-key'

  try {
    const cookie = getSessionCookieValue('secret-test-signing-key')
    assert.strictEqual(cookie.includes('pw-test-password'), false)
    assert.strictEqual(isAuthorizedRequest(requestWithCookie(cookie)), true)
    assert.strictEqual(
      isAuthorizedRequest(requestWithCookie('pw-test-password')),
      false
    )
  } finally {
    restoreEnv('ADMIN_PASSWORD', previousPassword)
    restoreEnv('ADMIN_SESSION_SECRET', previousSecret)
  }
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}
