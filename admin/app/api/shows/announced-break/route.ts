import { NextResponse } from 'next/server'
import {
  errorMessage,
  tryDispatchCheckWorkflow,
  withErrorResponse,
} from '@/lib/api-route'
import { getAnnouncedBreakSuggestion } from '@/lib/announced-break'
import { updateRepoFiles } from '@/lib/github'
import { addScheduleBreak } from '@/lib/schedule-break'
import type { Show } from '@shared/types'

// Confirms or dismisses a show's announced break. Confirming adds the
// suggested break to the schedule (like Add break) and clears the announced
// break; dismissing keeps it as dismissed, so the checker never alerts or
// suggests that (episode, date) again.
export async function POST(request: Request) {
  return withErrorResponse(
    {
      status: 400,
      message: (error) =>
        errorMessage(error, 'Failed to update announced break'),
    },
    async () => {
      const body = (await request.json()) as {
        showId?: string
        action?: string
      }
      const showId = body.showId?.trim()
      if (!showId) {
        throw new Error('showId is required')
      }

      if (body.action === 'dismiss') {
        await updateRepoFiles(
          ['state.json'],
          ({ 'state.json': state }) => {
            const announced = state.shows[showId]?.announcedBreak
            if (!announced) {
              throw new Error(`No announced break for ${showId}`)
            }
            announced.status = 'dismissed'
            return { 'state.json': state }
          },
          `chore: 🧹 dismiss the announced break for ${showId}`
        )
        return NextResponse.json({ ok: true })
      }

      if (body.action !== 'confirm') {
        throw new Error('action must be confirm or dismiss')
      }

      let show: Show | undefined
      let description = ''
      let versionBefore: string | null = null
      const { versions } = await updateRepoFiles(
        ['shows.json', 'state.json'],
        ({ 'shows.json': showsFile, 'state.json': state }, current) => {
          versionBefore = current['shows.json']
          show = showsFile.shows.find((entry) => entry.id === showId)
          const showState = state.shows[showId]
          if (!show || !showState) {
            throw new Error(`Show not found: ${showId}`)
          }

          const suggestion = getAnnouncedBreakSuggestion(
            show.schedule,
            showState.announcedBreak,
            showState.airingSchedule
          )
          if (!suggestion) {
            throw new Error(`No break to add for ${showId}`)
          }
          show.schedule.breaks = addScheduleBreak(
            show.schedule.breaks,
            suggestion.afterEpisode,
            suggestion.weeks
          )
          description = `a ${suggestion.weeks}-week break to ${showId} after episode ${suggestion.afterEpisode}`
          showState.announcedBreak = null
          showState.googleCalendarEvents = null

          return { 'shows.json': showsFile, 'state.json': state }
        },
        () => `chore: 🧹 add ${description} (announced)`
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
