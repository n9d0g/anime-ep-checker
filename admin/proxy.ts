import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAuthorizedRequest } from './lib/auth'

const ROBOTS_TAG = 'noindex, nofollow'

// Every answer also says which version is live, so an open tab can tell
// it's out of date (lib/new-version.ts).
function withAdminHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', ROBOTS_TAG)
  response.headers.set('X-App-Version', __APP_VERSION__)
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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/mal/callback') ||
    // The checker's drop trigger; the route checks PUSH_TRIGGER_SECRET.
    pathname === '/api/push/drop' ||
    pathname === '/login' ||
    isPublicPwaAsset(pathname)
  ) {
    return withAdminHeaders(NextResponse.next())
  }

  if (!(await isAuthorizedRequest(request))) {
    if (pathname.startsWith('/api/')) {
      return withAdminHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    }
    return withAdminHeaders(
      NextResponse.redirect(new URL('/login', request.url))
    )
  }

  return withAdminHeaders(NextResponse.next())
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)',
  ],
}
