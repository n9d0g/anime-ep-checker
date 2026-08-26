import type { NextRequest } from 'next/server'

export const COOKIE_NAME = 'admin_session'

export function isAuthorizedRequest(request: NextRequest): boolean {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return false

  const cookie = request.cookies.get(COOKIE_NAME)?.value
  return cookie === password
}

export function getSessionCookieValue(password: string): string {
  return password
}
