import { NextResponse } from 'next/server'
import {
  COOKIE_NAME,
  createSessionToken,
  isAdminPassword,
  SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth'

interface AuthBody {
  password?: string
}

export async function POST(request: Request) {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!process.env.ADMIN_PASSWORD || !secret) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD and ADMIN_SESSION_SECRET must be configured' },
      { status: 500 }
    )
  }

  const body = (await request.json()) as AuthBody
  if (!(await isAdminPassword(body.password ?? ''))) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, await createSessionToken(secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })
  return response
}
