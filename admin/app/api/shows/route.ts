import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import { getShowsFile, NO_STORE_HEADERS } from '@/lib/github'
import type { Show } from '@shared/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withErrorResponse(
    { status: 500, headers: NO_STORE_HEADERS },
    async () => {
      const { content, sha } = await getShowsFile()
      const shows = (content.shows ?? []).map((show: Show) => ({
        ...show,
        provider: show.provider ?? 'crunchyroll',
      }))
      return NextResponse.json(
        { shows, showsVersion: sha },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}
