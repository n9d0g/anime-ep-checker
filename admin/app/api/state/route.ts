import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import { NO_STORE_HEADERS, updateRepoFiles } from '@/lib/github'
import type { ShowState } from '@shared/types'

interface StatePatchBody {
  showId?: string
  episodeNumber?: number
}

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
  return withErrorResponse(
    { status: 400, headers: NO_STORE_HEADERS },
    async () => {
      const body = (await request.json()) as StatePatchBody
      const showId = body.showId?.trim()
      const episodeNumber = body.episodeNumber

      if (!showId) {
        throw new Error('showId is required')
      }

      if (!Number.isFinite(episodeNumber) || episodeNumber! < 1) {
        throw new Error('episodeNumber must be a positive number')
      }

      let existing: ShowState | undefined
      await updateRepoFiles(
        ['state.json'],
        ({ 'state.json': state }) => {
          existing = state.shows?.[showId]
          if (!existing) {
            throw new Error(`No state found for show: ${showId}`)
          }

          state.shows[showId] = {
            ...existing,
            lastEpisodeNumber: String(episodeNumber),
            waitingNotifiedForEpisode: null,
          }
          return { 'state.json': state }
        },
        'chore: 🧹 update episode progress from admin CMS'
      )

      return NextResponse.json(
        {
          ok: true,
          show: {
            lastEpisodeNumber: String(episodeNumber),
            lastEpisodeTitle: existing!.lastEpisodeTitle,
            lastNotifiedAt: existing!.lastNotifiedAt,
          },
        },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}
