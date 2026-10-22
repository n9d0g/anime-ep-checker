import { NextResponse } from 'next/server'
import {
  parseMalId,
  tryDispatchCheckWorkflow,
  withErrorResponse,
} from '@/lib/api-route'
import { updateRepoFiles } from '@/lib/github'
import { setMalAnimeListStatus } from '@/lib/mal'
import type { OnHoldSnapshot, Show } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface MalOnHoldBody {
  malId?: number
  showId?: string
}

function upsertOnHoldEntry(
  snapshot: OnHoldSnapshot | undefined,
  show: Show,
  heldAt: string
): OnHoldSnapshot {
  const entries = (snapshot?.entries ?? []).filter(
    (entry) => entry.show.id !== show.id
  )
  entries.push({ show, heldAt })
  entries.sort((a, b) =>
    a.show.title.localeCompare(b.show.title, undefined, { sensitivity: 'base' })
  )

  return {
    updatedAt: heldAt,
    entries,
  }
}

export async function POST(request: Request) {
  return withErrorResponse({ status: 400 }, async () => {
    const body = (await request.json()) as MalOnHoldBody
    const malId = parseMalId(body.malId)
    const showId = body.showId?.trim()

    if (!showId) {
      throw new Error('showId is required')
    }

    await setMalAnimeListStatus(malId, 'on_hold')

    let versionBefore: string | null = null
    const { versions } = await updateRepoFiles(
      ['shows.json', 'state.json'],
      ({ 'shows.json': showsFile, 'state.json': state }, current) => {
        versionBefore = current['shows.json']
        const shows = showsFile.shows ?? []
        const show = shows.find((entry) => entry.id === showId)
        if (!show) {
          throw new Error(`Show not found: ${showId}`)
        }

        const heldAt = new Date().toISOString()
        state.meta = {
          ...state.meta,
          onHold: upsertOnHoldEntry(state.meta?.onHold, show, heldAt),
        }

        return {
          'shows.json': {
            ...showsFile,
            shows: shows.filter((entry) => entry.id !== showId),
          },
          'state.json': state,
        }
      },
      `chore: put ${showId} on hold`
    )

    const cleanupTriggered = await tryDispatchCheckWorkflow(false)

    return NextResponse.json({
      ok: true,
      cleanupTriggered,
      showsVersion: versions['shows.json'],
      showsVersionBefore: versionBefore,
    })
  })
}
