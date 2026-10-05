import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthorizedRequest } from './lib/auth'

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
    pathname.startsWith('/api/discord/interactions') ||
    pathname.startsWith('/api/mal/callback') ||
    pathname === '/login' ||
    isPublicPwaAsset(pathname)
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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)',
  ],
}
