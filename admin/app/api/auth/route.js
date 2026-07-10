import { NextResponse } from 'next/server'
import { COOKIE_NAME, getSessionCookieValue } from '../../../lib/auth.js'

export async function POST(request) {
  const password = process.env.ADMIN_PASSWORD
  if (!password) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD is not configured' }, { status: 500 })
  }

  const body = await request.json()
  if (body.password !== password) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(COOKIE_NAME, getSessionCookieValue(password), {
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
