import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import { getShowsFile, NO_STORE_HEADERS } from '@/lib/github'
import { fetchWatchedByShowId } from '@/lib/mal-watched'
import type { Show } from '@shared/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withErrorResponse(
    { status: 500, headers: NO_STORE_HEADERS },
    async () => {
      const { content } = await getShowsFile()
      const shows = (content.shows ?? []) as Show[]
      const { watchedByShowId, malDown } = await fetchWatchedByShowId(shows)

      return NextResponse.json(
        { watchedByShowId, malDown },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}
