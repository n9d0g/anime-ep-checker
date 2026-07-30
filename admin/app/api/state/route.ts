import { NextResponse } from 'next/server'
import { getStateFile, saveStateFile } from '@/lib/github'
import type { ShowStateSummary, StateFile } from '@/lib/types'

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
    }
  }

  return result
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
    const { content } = await getStateFile()
    return NextResponse.json({ shows: toSummaryMap(content as StateFile) })
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
