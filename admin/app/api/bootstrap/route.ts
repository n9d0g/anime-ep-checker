import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import { getRepoFiles, NO_STORE_HEADERS } from '@/lib/github'
import type { PlanToWatchSnapshotEntry, Show, StateFile } from '@shared/types'
import type { ShowStateSummary } from '@/lib/types'

export const dynamic = 'force-dynamic'

function toSummaryMap(state: StateFile): Record<string, ShowStateSummary> {
  const result: Record<string, ShowStateSummary> = {}

  for (const [showId, showState] of Object.entries(state.shows ?? {})) {
    result[showId] = {
      lastEpisodeNumber: showState.lastEpisodeNumber,
      lastEpisodeTitle: showState.lastEpisodeTitle,
      lastNotifiedAt: showState.lastNotifiedAt,
      watchedEpisode: null,
      airingSchedule: showState.airingSchedule ?? null,
      officialSiteUrl: showState.officialSiteUrl,
      announcedBreak: showState.announcedBreak ?? null,
    }
  }

  return result
}

/** Plan to watch shows the checker alerted as having started airing. */
function airingPlanToWatch(state: StateFile): PlanToWatchSnapshotEntry[] {
  const alerts = state.meta?.planToWatchAlerts ?? {}
  return (state.meta?.planToWatch?.entries ?? []).filter(
    (entry) => alerts[String(entry.malId)]?.reason === 'airing'
  )
}

export async function GET() {
  return withErrorResponse(
    { status: 500, headers: NO_STORE_HEADERS },
    async () => {
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
          showsVersion: showsFile.sha,
          showStates: toSummaryMap(state),
          airingPlanToWatch: airingPlanToWatch(state),
        },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}
