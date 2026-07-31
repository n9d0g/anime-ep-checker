import { NextResponse } from 'next/server'
import { setMalWatchedEpisode } from '@/lib/mal'

interface MalProgressPatchBody {
  malId?: number
  episodeNumber?: number
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as MalProgressPatchBody
    const malId = body.malId
    const episodeNumber = body.episodeNumber

    if (!Number.isFinite(malId) || malId! < 1) {
      throw new Error('malId must be a positive number')
    }

    if (!Number.isFinite(episodeNumber) || episodeNumber! < 0) {
      throw new Error('episodeNumber must be zero or greater')
    }

    const result = await setMalWatchedEpisode(malId!, episodeNumber!)

    return NextResponse.json({
      ok: true,
      watched: result.watched,
      total: result.total,
      updated: result.updated,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message.includes('MAL_') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
