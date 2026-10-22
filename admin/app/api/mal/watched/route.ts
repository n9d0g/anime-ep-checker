import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import { getShowsFile, NO_STORE_HEADERS } from '@/lib/github'
import { fetchMalAnimeDetails, isMalOutageError } from '@/lib/mal'
import type { Show } from '@shared/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withErrorResponse(
    { status: 500, headers: NO_STORE_HEADERS },
    async () => {
      const { content } = await getShowsFile()
      const shows = (content.shows ?? []) as Show[]

      const watchedByShowId: Record<string, number | null> = {}
      let malDown = false

      await Promise.all(
        shows.map(async (show) => {
          if (!show.malId) {
            watchedByShowId[show.id] = null
            return
          }

          try {
            const details = await fetchMalAnimeDetails(show.malId)
            watchedByShowId[show.id] = details.watched
          } catch (error) {
            watchedByShowId[show.id] = null
            if (isMalOutageError(error)) {
              malDown = true
            }
          }
        })
      )

      return NextResponse.json(
        { watchedByShowId, malDown },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}
