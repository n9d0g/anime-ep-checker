import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import {
  getShowsFile,
  getStateFile,
  NO_STORE_HEADERS,
  updateRepoFiles,
} from '@/lib/github'
import { fetchMalAnimeDetails } from '@/lib/mal'
import type { Show, ShowState, StateFile } from '@shared/types'
import type { ShowStateSummary } from '@/lib/types'

interface StatePatchBody {
  showId?: string
  episodeNumber?: number
}

function toSummaryMap(state: StateFile): Record<string, ShowStateSummary> {
  const result: Record<string, ShowStateSummary> = {}

  for (const [showId, showState] of Object.entries(state.shows ?? {})) {
    result[showId] = {
      lastEpisodeNumber: showState.lastEpisodeNumber,
      lastEpisodeTitle: showState.lastEpisodeTitle,
      lastNotifiedAt: showState.lastNotifiedAt,
      watchedEpisode: null,
    }
  }

  return result
}

async function attachMalWatched(
  summaries: Record<string, ShowStateSummary>,
  shows: Show[]
): Promise<Record<string, ShowStateSummary>> {
  const next = { ...summaries }

  await Promise.all(
    shows.map(async (show) => {
      if (!show.malId || !next[show.id]) {
        return
      }

      try {
        const details = await fetchMalAnimeDetails(show.malId)
        next[show.id] = {
          ...next[show.id],
          watchedEpisode: details.watched,
        }
      } catch {
        next[show.id] = {
          ...next[show.id],
          watchedEpisode: null,
        }
      }
    })
  )

  return next
}

export const dynamic = 'force-dynamic'

export async function GET() {
  return withErrorResponse(
    { status: 500, headers: NO_STORE_HEADERS },
    async () => {
      const [{ content: stateContent }, { content: showsContent }] =
        await Promise.all([getStateFile(), getShowsFile()])

      const summaries = toSummaryMap(stateContent as StateFile)
      const shows = (showsContent.shows ?? []) as Show[]
      const enriched = await attachMalWatched(summaries, shows)

      return NextResponse.json(
        { shows: enriched },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}

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
