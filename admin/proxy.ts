import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthorizedRequest } from './lib/auth'

const ROBOTS_TAG = 'noindex, nofollow'

function withRobotsTag(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', ROBOTS_TAG)
  return response
}

function isPublicPwaAsset(pathname: string): boolean {
  return (
    pathname === '/manifest.webmanifest' ||
    pathname.startsWith('/icons/') ||
    pathname === '/icon.jpg' ||
    pathname === '/apple-icon.jpg'
  )
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/mal/callback') ||
    pathname === '/login' ||
    isPublicPwaAsset(pathname)
  ) {
    return withRobotsTag(NextResponse.next())
  }

  if (!isAuthorizedRequest(request)) {
    if (pathname.startsWith('/api/')) {
      return withRobotsTag(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    }
    return withRobotsTag(
      NextResponse.redirect(new URL('/login', request.url))
    )
  }

  return withRobotsTag(NextResponse.next())
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)',
  ],
}
