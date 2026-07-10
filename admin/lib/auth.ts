import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

export const COOKIE_NAME = 'admin_session'

export function isAuthorizedRequest(request: NextRequest): boolean {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return false

  const cookie = request.cookies.get(COOKIE_NAME)?.value
  return cookie === password
}

export async function isAuthorized(): Promise<boolean> {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return false

  const cookieStore = await cookies()
  return cookieStore.get(COOKIE_NAME)?.value === password
}

export function getSessionCookieValue(password: string): string {
  return password
}
