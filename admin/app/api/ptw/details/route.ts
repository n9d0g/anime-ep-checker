import { NextResponse } from 'next/server'
import { MAL_LIST_ERRORS, withErrorResponse } from '@/lib/api-route'
import { NO_STORE_HEADERS } from '@/lib/github'
import { fetchPlanToWatchDetails } from '@/lib/mal'
import type { PtwDetailsList } from '@/lib/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withErrorResponse(
    { ...MAL_LIST_ERRORS, headers: NO_STORE_HEADERS },
    async () => {
      const details: PtwDetailsList = {
        fetchedAt: new Date().toISOString(),
        details: await fetchPlanToWatchDetails(),
      }
      return NextResponse.json({ details }, { headers: NO_STORE_HEADERS })
    }
  )
}
