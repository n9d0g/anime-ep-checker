import { NextResponse } from 'next/server'
import { NO_STORE_HEADERS } from '@/lib/github'
import { fetchPlanToWatchDetails } from '@/lib/mal'
import type { PtwDetailsList } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const details: PtwDetailsList = {
      fetchedAt: new Date().toISOString(),
      details: await fetchPlanToWatchDetails(),
    }
    return NextResponse.json({ details }, { headers: NO_STORE_HEADERS })
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
