import { NextResponse } from 'next/server'
import { getShowsFile, getStateFile, saveStateFile } from '@/lib/github'
import { fetchMalAnimeDetails } from '@/lib/mal'
import type { Show, ShowStateSummary, StateFile } from '@/lib/types'

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

async function saveStateWithRetry(state: StateFile): Promise<void> {
  let { sha } = await getStateFile()

  try {
    await saveStateFile(state, sha)
    return
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isConflict = message.includes('409') || message.includes('422')

    if (!isConflict) {
      throw error
    }
  }

  const refreshed = await getStateFile()
  await saveStateFile(state, refreshed.sha)
}

export async function GET() {
  try {
    const [{ content: stateContent }, { content: showsContent }] =
      await Promise.all([getStateFile(), getShowsFile()])

    const summaries = toSummaryMap(stateContent as StateFile)
    const shows = (showsContent.shows ?? []) as Show[]
    const enriched = await attachMalWatched(summaries, shows)

    return NextResponse.json({ shows: enriched })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as StatePatchBody
    const showId = body.showId?.trim()
    const episodeNumber = body.episodeNumber

    if (!showId) {
      throw new Error('showId is required')
    }

    if (!Number.isFinite(episodeNumber) || episodeNumber! < 1) {
      throw new Error('episodeNumber must be a positive number')
    }

    const { content } = await getStateFile()
    const state = content as StateFile
    const existing = state.shows?.[showId]

    if (!existing) {
      throw new Error(`No state found for show: ${showId}`)
    }

    state.shows[showId] = {
      ...existing,
      lastEpisodeNumber: String(episodeNumber),
      waitingNotifiedForEpisode: null,
    }

    await saveStateWithRetry(state)

    return NextResponse.json({
      ok: true,
      show: {
        lastEpisodeNumber: String(episodeNumber),
        lastEpisodeTitle: existing.lastEpisodeTitle,
        lastNotifiedAt: existing.lastNotifiedAt,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
