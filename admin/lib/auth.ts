import type { NextRequest } from 'next/server'

export const COOKIE_NAME = 'admin_session'

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

const encoder = new TextEncoder()

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

/** Compares in time that depends only on length, not on where they differ. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return diff === 0
}

async function sign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)))
}

/** Session cookie value: `<issuedAtMs>.<HMAC-SHA256 of it>`. */
export async function createSessionToken(
  secret: string,
  now = new Date()
): Promise<string> {
  const issuedAt = String(now.getTime())
  return `${issuedAt}.${await sign(secret, issuedAt)}`
}

export async function verifySessionToken(
  token: string,
  secret: string,
  now = new Date()
): Promise<boolean> {
  const match = /^(\d+)\.([0-9a-f]{64})$/.exec(token)
  if (!match) return false

  const [, issuedAt, signature] = match
  const expected = await sign(secret, issuedAt)
  if (!constantTimeEqual(signature, expected)) return false

  const ageMs = now.getTime() - Number(issuedAt)
  return ageMs >= 0 && ageMs <= SESSION_MAX_AGE_SECONDS * 1000
}

/** Checks a login attempt without leaking how much of the password matched. */
export async function isAdminPassword(attempt: string): Promise<boolean> {
  const password = process.env.ADMIN_PASSWORD
  if (!password) return false
  // Hash both so the comparison is fixed-length regardless of input.
  const [attemptHash, passwordHash] = await Promise.all(
    [attempt, password].map(async (value) =>
      toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
    )
  )
  return constantTimeEqual(attemptHash, passwordHash)
}

export async function isAuthorizedRequest(
  request: NextRequest
): Promise<boolean> {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) return false

  const cookie = request.cookies.get(COOKIE_NAME)?.value
  return cookie ? verifySessionToken(cookie, secret) : false
}
