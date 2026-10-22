import { NextResponse } from 'next/server'
import {
  errorMessage,
  tryDispatchCheckWorkflow,
  withErrorResponse,
} from '@/lib/api-route'
import { updateRepoFiles } from '@/lib/github'
import type { Show } from '@shared/types'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

export async function POST(request: Request) {
  return withErrorResponse(
    {
      status: 400,
      message: (error) => errorMessage(error, 'Failed to delay show'),
    },
    async () => {
      const body = (await request.json()) as { showId?: string }
      const showId = body.showId?.trim()
      if (!showId) {
        throw new Error('showId is required')
      }

      let show: Show | undefined
      let versionBefore: string | null = null
      const { versions } = await updateRepoFiles(
        ['shows.json', 'state.json'],
        ({ 'shows.json': showsFile, 'state.json': state }, current) => {
          versionBefore = current['shows.json']
          show = showsFile.shows.find((entry) => entry.id === showId)
          if (!show) {
            throw new Error(`Show not found: ${showId}`)
          }

          const start = new Date(show.schedule.startAt)
          if (Number.isNaN(start.getTime())) {
            throw new Error('Invalid schedule startAt')
          }
          show.schedule.startAt = new Date(
            start.getTime() + MS_PER_WEEK
          ).toISOString()

          const showState = state.shows[showId]
          if (showState) {
            showState.googleCalendarEvents = null
          }

          return { 'shows.json': showsFile, 'state.json': state }
        },
        `chore: 🧹 delay ${showId} schedule by one week`
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
