import { NextResponse } from 'next/server'
import {
  dispatchCheckWorkflow,
  getStateFile,
  updateRepoFiles,
} from '@/lib/github'
import { setMalWatchingStatus } from '@/lib/mal'
import type { Show, StateFile } from '@/lib/types'

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

    let show: Show | undefined
    await updateRepoFiles(
      ['shows.json', 'state.json'],
      ({ 'shows.json': showsFile, 'state.json': state }) => {
        const entries = state.meta?.onHold?.entries ?? []
        show = entries.find((item) => item.show.id === showId)?.show
        if (!show) {
          throw new Error(`On-hold entry not found: ${showId}`)
        }
        if (!show.malId || show.malId < 1) {
          throw new Error('Show must have a MAL ID to restore to watching')
        }

        const restored = show
        const shows = showsFile.shows ?? []
        const alreadyTracked = shows.some(
          (item) => item.id === showId || item.malId === restored.malId
        )

        state.meta = {
          ...state.meta,
          onHold: {
            updatedAt: new Date().toISOString(),
            entries: entries.filter((item) => item.show.id !== showId),
          },
        }

        return {
          'shows.json': alreadyTracked
            ? showsFile
            : { ...showsFile, shows: [...shows, restored] },
          'state.json': state,
        }
      },
      `chore: restore ${showId} from on hold to watching`
    )

    let malUpdated = false
    try {
      await setMalWatchingStatus(show!.malId!)
      malUpdated = true
    } catch (error) {
      console.warn('Failed to mark MAL status watching:', error)
    }

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
