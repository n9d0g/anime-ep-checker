import { NextResponse } from 'next/server'
import {
  parseMalId,
  tryDispatchCheckWorkflow,
  withErrorResponse,
} from '@/lib/api-route'
import { updateRepoFiles } from '@/lib/github'
import { completeMalAnime } from '@/lib/mal'

interface MalCompleteBody {
  malId?: number
  showId?: string
  score?: number
}

export async function POST(request: Request) {
  return withErrorResponse({ status: 400 }, async () => {
    const body = (await request.json()) as MalCompleteBody
    const malId = parseMalId(body.malId)
    const showId = body.showId?.trim()
    const score = body.score

    if (!showId) {
      throw new Error('showId is required')
    }

    if (!Number.isInteger(score) || score! < 1 || score! > 10) {
      throw new Error('score must be an integer from 1 to 10')
    }

    await completeMalAnime(malId, score!)

    const { versions } = await updateRepoFiles(
      ['shows.json'],
      ({ 'shows.json': showsFile }) => {
        const shows = showsFile.shows ?? []
        if (!shows.some((entry) => entry.id === showId)) {
          throw new Error(`Show not found: ${showId}`)
        }
        return {
          'shows.json': {
            ...showsFile,
            shows: shows.filter((entry) => entry.id !== showId),
          },
        }
      },
      `chore: complete ${showId} on MAL`
    )

    const cleanupTriggered = await tryDispatchCheckWorkflow(false)

    return NextResponse.json({
      ok: true,
      cleanupTriggered,
      showsVersion: versions['shows.json'],
    })
  })
}
