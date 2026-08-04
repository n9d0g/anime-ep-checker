import { NextResponse } from 'next/server'
import { syncShowsWithMal } from '@/lib/sync-mal'
import { getShowsFile } from '@/lib/github'
import type { Show } from '@/lib/types'

export async function POST() {
  try {
    const result = await syncShowsWithMal()
    const { content } = await getShowsFile()
    const shows = (content.shows ?? []).map((show: Show) => ({
      ...show,
      provider: show.provider ?? 'crunchyroll',
    }))

    return NextResponse.json({
      ok: true,
      changed: result.changed,
      resolvedIds: result.resolvedIds,
      updatedTitles: result.updatedTitles,
      shows,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message.includes('MAL_') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
