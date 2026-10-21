import { createHmac, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'

export const COOKIE_NAME = 'admin_session'

const SESSION_PAYLOAD = 'admin-session'

export function isAuthorizedRequest(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) return false

  const cookie = request.cookies.get(COOKIE_NAME)?.value
  if (!cookie) return false

  const expected = Buffer.from(getSessionCookieValue(secret))
  const actual = Buffer.from(cookie)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function getSessionCookieValue(secret: string): string {
  const signature = createHmac('sha256', secret)
    .update(SESSION_PAYLOAD)
    .digest('base64url')
  return `${SESSION_PAYLOAD}.${signature}`
}
