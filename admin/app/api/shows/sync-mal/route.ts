import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/github'
import { syncShowsWithMal } from '@/lib/sync-mal'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await syncShowsWithMal()

    return NextResponse.json(
      {
        ok: true,
        changed: result.changed,
        resolvedIds: result.resolvedIds,
        updatedTitles: result.updatedTitles,
        shows: result.shows,
      },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message.includes('MAL_') ? 400 : 500
    return NextResponse.json(
      { error: message },
      { status, headers: NO_STORE_HEADERS }
    )
  }
}
