import { NextResponse } from 'next/server'
import { getRepoFiles, NO_STORE_HEADERS } from '@/lib/github'
import type { Show, ShowStateSummary, StateFile } from '@/lib/types'

export const dynamic = 'force-dynamic'

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

export async function GET() {
  try {
    const { files } = await getRepoFiles(['shows.json', 'state.json'])
    const showsFile = files['shows.json']
    const stateFile = files['state.json']

    if (!showsFile?.content) {
      throw new Error('shows.json not found in repository')
    }

    const shows = ((showsFile.content as { shows?: Show[] }).shows ?? []).map(
      (show) => ({
        ...show,
        provider: show.provider ?? 'crunchyroll',
      })
    )

    const state = (stateFile?.content ?? { shows: {} }) as StateFile

    return NextResponse.json(
      {
        shows,
        showStates: toSummaryMap(state),
      },
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
