import { NextResponse } from 'next/server'
import { MAL_LIST_ERRORS, withErrorResponse } from '@/lib/api-route'
import { NO_STORE_HEADERS } from '@/lib/github'
import { fetchCompletedAnime } from '@/lib/mal'
import type { WatchedList } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withErrorResponse(
    { ...MAL_LIST_ERRORS, headers: NO_STORE_HEADERS },
    async () => {
      const watched: WatchedList = {
        fetchedAt: new Date().toISOString(),
        entries: await fetchCompletedAnime(),
      }
      return NextResponse.json({ watched }, { headers: NO_STORE_HEADERS })
    }
  )
}
