import { NextResponse } from 'next/server'
import { getShowsFile, NO_STORE_HEADERS } from '@/lib/github'
import { fetchMalAnimeDetails } from '@/lib/mal'
import type { Show } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { content } = await getShowsFile()
    const shows = (content.shows ?? []) as Show[]

    const watchedByShowId: Record<string, number | null> = {}

    await Promise.all(
      shows.map(async (show) => {
        if (!show.malId) {
          watchedByShowId[show.id] = null
          return
        }

        try {
          const details = await fetchMalAnimeDetails(show.malId)
          watchedByShowId[show.id] = details.watched
        } catch {
          watchedByShowId[show.id] = null
        }
      })
    )

    return NextResponse.json(
      { watchedByShowId },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}
