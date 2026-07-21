import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthorizedRequest } from './lib/auth'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/discord/interactions') ||
    pathname.startsWith('/api/mal/callback') ||
    pathname === '/login'
  ) {
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
