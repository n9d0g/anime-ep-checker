import { NextResponse } from 'next/server'
import { dispatchCheckWorkflow, updateRepoFiles } from '@/lib/github'
import type { Show } from '@/lib/types'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { showId?: string }
    const showId = body.showId?.trim()
    if (!showId) {
      throw new Error('showId is required')
    }

    let show: Show | undefined
    const { versions } = await updateRepoFiles(
      ['shows.json', 'state.json'],
      ({ 'shows.json': showsFile, 'state.json': state }) => {
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

    let workflowTriggered = false
    try {
      await dispatchCheckWorkflow(true)
      workflowTriggered = true
    } catch (error) {
      console.warn('Failed to dispatch forced check workflow:', error)
    }

    return NextResponse.json({
      ok: true,
      workflowTriggered,
      show,
      showsVersion: versions['shows.json'],
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to delay show',
      },
      { status: 400 }
    )
  }
}
