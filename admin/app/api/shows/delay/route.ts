import { NextResponse } from 'next/server'
import {
  dispatchCheckWorkflow,
  getShowsFile,
  getStateFile,
  saveShowsFile,
  saveStateFile,
} from '@/lib/github'
import type { ShowsFile, StateFile } from '@/lib/types'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { showId?: string }
    const showId = body.showId?.trim()
    if (!showId) {
      throw new Error('showId is required')
    }

    const { content: showsContent, sha: showsSha } = await getShowsFile()
    const showsFile = showsContent as ShowsFile
    const show = showsFile.shows.find((entry) => entry.id === showId)
    if (!show) {
      throw new Error(`Show not found: ${showId}`)
    }

    const start = new Date(show.schedule.startAt)
    if (Number.isNaN(start.getTime())) {
      throw new Error('Invalid schedule startAt')
    }
    show.schedule.startAt = new Date(start.getTime() + MS_PER_WEEK).toISOString()

    const { content: stateContent, sha: stateSha } = await getStateFile()
    const state = stateContent as StateFile
    const showState = state.shows[showId]
    if (showState) {
      showState.discordScheduledEventId = null
      showState.discordScheduledEventEpisode = null
      showState.googleCalendarEvents = null
    }

    await saveShowsFile(
      showsFile.shows,
      showsSha,
      `chore: 🧹 delay ${show.title || showId} schedule by one week`
    )
    await saveStateFile(
      state,
      stateSha,
      `chore: 🧹 clear event state after delaying ${show.title || showId}`
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
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delay show' },
      { status: 400 }
    )
  }
}
