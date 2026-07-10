import { NextResponse } from 'next/server'
import { COOKIE_NAME, isAuthorizedRequest } from './lib/auth.js'

export function middleware(request) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/auth') || pathname === '/login') {
    return NextResponse.next()
  }

  if (!isAuthorizedRequest(request)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
