import { NextResponse } from 'next/server'
import {
  dispatchCheckWorkflow,
  getShowsFile,
  getStateFile,
  saveShowsFileRetrying,
  saveStateFileRetrying,
} from '@/lib/github'
import { setMalWatchingStatus } from '@/lib/mal'
import type { OnHoldSnapshot, Show, StateFile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { content } = await getStateFile()
    const state = content as StateFile
    return NextResponse.json({
      onHold: state.meta?.onHold ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

interface RestoreBody {
  showId?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RestoreBody
    const showId = body.showId?.trim()
    if (!showId) {
      throw new Error('showId is required')
    }

    const { content: stateContent } = await getStateFile()
    const state = stateContent as StateFile
    const onHold = state.meta?.onHold
    const entry = onHold?.entries.find((item) => item.show.id === showId)
    if (!entry) {
      throw new Error(`On-hold entry not found: ${showId}`)
    }

    const show = entry.show
    if (!show.malId || show.malId < 1) {
      throw new Error('Show must have a MAL ID to restore to watching')
    }

    const { content: showsContent } = await getShowsFile()
    const shows = (showsContent.shows ?? []) as Show[]
    const alreadyTracked = shows.some(
      (item) => item.id === showId || item.malId === show.malId
    )

    if (!alreadyTracked) {
      await saveShowsFileRetrying(
        [...shows, show],
        `chore: restore ${show.title || showId} to watching`
      )
    }

    let malUpdated = false
    try {
      await setMalWatchingStatus(show.malId)
      malUpdated = true
    } catch (error) {
      console.warn('Failed to mark MAL status watching:', error)
    }

    const { content: latestStateContent } = await getStateFile()
    const latestState = latestStateContent as StateFile
    const updatedAt = new Date().toISOString()
    const nextEntries = (latestState.meta?.onHold?.entries ?? []).filter(
      (item) => item.show.id !== showId
    )
    const nextSnapshot: OnHoldSnapshot = {
      updatedAt,
      entries: nextEntries,
    }

    latestState.meta = {
      ...latestState.meta,
      onHold: nextSnapshot,
    }

    await saveStateFileRetrying(
      latestState,
      `chore: remove ${show.title || showId} from on hold`
    )

    let workflowTriggered = false
    try {
      await dispatchCheckWorkflow(true)
      workflowTriggered = true
    } catch (error) {
      console.warn('Failed to dispatch check workflow:', error)
    }

    return NextResponse.json({
      ok: true,
      show,
      malUpdated,
      workflowTriggered,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
