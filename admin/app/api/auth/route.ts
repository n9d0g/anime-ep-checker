import { NextResponse } from 'next/server'
import { COOKIE_NAME, getSessionCookieValue } from '@/lib/auth'

interface AuthBody {
  password?: string
}

export async function POST(request: Request) {
  const password = process.env.ADMIN_PASSWORD
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!password || !secret) {
    return NextResponse.json(
      { error: 'ADMIN_PASSWORD and ADMIN_SESSION_SECRET must be configured' },
      { status: 500 }
    )
  }

  const body = (await request.json()) as AuthBody
  if (body.password !== password) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, getSessionCookieValue(secret), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
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
