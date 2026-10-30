import { NextResponse } from 'next/server'
import {
  errorMessage,
  tryDispatchCheckWorkflow,
  withErrorResponse,
} from '@/lib/api-route'
import { updateRepoFiles } from '@/lib/github'
import { addScheduleBreak, getBreakAfterEpisode } from '@/lib/schedule-break'
import type { Show } from '@shared/types'

// Adds a break after the show's last dropped episode: later drops shift by
// `weeks`, earlier ones stay put. Calendar events are cleared and a forced
// check rebuilds Discord and Calendar.
export async function POST(request: Request) {
  return withErrorResponse(
    {
      status: 400,
      message: (error) => errorMessage(error, 'Failed to add break'),
    },
    async () => {
      const body = (await request.json()) as {
        showId?: string
        weeks?: number
        /** Confirmed past the warning that AniList already shows a gap. */
        onTopOfAniList?: boolean
      }
      const showId = body.showId?.trim()
      if (!showId) {
        throw new Error('showId is required')
      }
      const weeks = body.weeks ?? 1

      let show: Show | undefined
      let afterEpisode = 0
      let versionBefore: string | null = null
      const { versions } = await updateRepoFiles(
        ['shows.json', 'state.json'],
        ({ 'shows.json': showsFile, 'state.json': state }, current) => {
          versionBefore = current['shows.json']
          show = showsFile.shows.find((entry) => entry.id === showId)
          if (!show) {
            throw new Error(`Show not found: ${showId}`)
          }

          const showState = state.shows[showId]
          afterEpisode = getBreakAfterEpisode(
            show.schedule,
            showState?.lastEpisodeNumber
          )
          show.schedule.breaks = addScheduleBreak(
            show.schedule.breaks,
            afterEpisode,
            weeks,
            body.onTopOfAniList === true
          )

          if (showState) {
            showState.googleCalendarEvents = null
          }

          return { 'shows.json': showsFile, 'state.json': state }
        },
        () =>
          `chore: 🧹 add a ${weeks}-week break to ${showId} after episode ${afterEpisode}`
      )

      const workflowTriggered = await tryDispatchCheckWorkflow(true)

      return NextResponse.json({
        ok: true,
        workflowTriggered,
        show,
        showsVersion: versions['shows.json'],
        showsVersionBefore: versionBefore,
      })
    }
  )
}
