import { NextResponse } from 'next/server'
import { malConfigErrorStatus, withErrorResponse } from '@/lib/api-route'
import { NO_STORE_HEADERS } from '@/lib/github'
import { syncOnHoldEnglishTitles, syncShowsWithMal } from '@/lib/sync-mal'

export const dynamic = 'force-dynamic'

export async function POST() {
  return withErrorResponse(
    { status: malConfigErrorStatus, headers: NO_STORE_HEADERS },
    async () => {
      const result = await syncShowsWithMal()
      const onHoldEnglish = await syncOnHoldEnglishTitles()

      return NextResponse.json(
        {
          ok: true,
          changed: result.changed || onHoldEnglish.changed,
          resolvedIds: result.resolvedIds,
          updatedTitles: result.updatedTitles,
          updatedEnglish: result.updatedEnglish,
          updatedEpisodeCounts: result.updatedEpisodeCounts,
          updatedStartTimes: result.updatedStartTimes,
          onHoldEnglishUpdated: onHoldEnglish.updatedShowIds,
          shows: result.shows,
          showsVersion: result.showsVersion,
        },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}
