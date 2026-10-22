import { NextResponse } from 'next/server'
import {
  attempt,
  tryDispatchCheckWorkflow,
  withErrorResponse,
} from '@/lib/api-route'
import { getStateFile, updateRepoFiles } from '@/lib/github'
import { setMalWatchingStatus } from '@/lib/mal'
import type { Show, StateFile } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withErrorResponse({ status: 500 }, async () => {
    const { content } = await getStateFile()
    const state = content as StateFile
    return NextResponse.json({
      onHold: state.meta?.onHold ?? null,
    })
  })
}

interface RestoreBody {
  showId?: string
}

export async function POST(request: Request) {
  return withErrorResponse({ status: 400 }, async () => {
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

    const malUpdated = await attempt(
      () => setMalWatchingStatus(show!.malId!),
      'Failed to mark MAL status watching:'
    )

    const workflowTriggered = await tryDispatchCheckWorkflow(true)

    return NextResponse.json({
      ok: true,
      show,
      malUpdated,
      workflowTriggered,
    })
  })
}
