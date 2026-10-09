import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/github'
import { fetchCompletedAnime } from '@/lib/mal'
import type { WatchedList } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const watched: WatchedList = {
      fetchedAt: new Date().toISOString(),
      entries: await fetchCompletedAnime(),
    }
    return NextResponse.json({ watched }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const notConfigured =
      message.includes('MAL_CLIENT_ID') || message.includes('MAL_REFRESH_TOKEN')
    return NextResponse.json(
      {
        error: notConfigured
          ? 'MAL is not configured. Connect MAL from /mal first.'
          : message,
      },
      { status: notConfigured ? 400 : 502, headers: NO_STORE_HEADERS }
    )
  }
}
