import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import { fetchAniListMedia } from '@/lib/anilist'
import { NO_STORE_HEADERS } from '@/lib/github'

export const dynamic = 'force-dynamic'

/** Most shows one request asks about: every list at once stays well under it. */
const MAX_IDS = 1000

// AniList banners, covers and producers by MAL ID, for the list rows and
// sheets. The browser caches the answers, so this only sees shows it hasn't.
export async function POST(request: Request) {
  return withErrorResponse(
    { status: 400, headers: NO_STORE_HEADERS },
    async () => {
      const body = (await request.json()) as { malIds?: unknown }
      if (!Array.isArray(body.malIds)) {
        throw new Error('malIds is required')
      }
      const malIds = body.malIds
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
        .slice(0, MAX_IDS)
      return NextResponse.json(
        { media: await fetchAniListMedia(malIds) },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}
