import { NextResponse } from 'next/server'
import {
  errorResponse,
  malConfigErrorStatus,
  parseMalId,
} from '@/lib/api-route'
import { isMalOutageError, setMalWatchedEpisode } from '@/lib/mal'

interface MalProgressPatchBody {
  malId?: number
  episodeNumber?: number
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as MalProgressPatchBody
    const malId = parseMalId(body.malId)
    const episodeNumber = body.episodeNumber

    if (!Number.isFinite(episodeNumber) || episodeNumber! < 0) {
      throw new Error('episodeNumber must be zero or greater')
    }

    const result = await setMalWatchedEpisode(malId, episodeNumber!)

    return NextResponse.json({
      ok: true,
      watched: result.watched,
      total: result.total,
      updated: result.updated,
    })
  } catch (error) {
    if (isMalOutageError(error)) {
      return NextResponse.json(
        { error: 'MAL servers are down. Try again later.', malDown: true },
        { status: 503 }
      )
    }

    return errorResponse(error, { status: malConfigErrorStatus })
  }
}
