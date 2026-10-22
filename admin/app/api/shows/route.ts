import { NextResponse } from 'next/server'
import { tryDispatchCheckWorkflow, withErrorResponse } from '@/lib/api-route'
import { getShowsFile, NO_STORE_HEADERS } from '@/lib/github'
import { normalizeShow } from '@/lib/normalize-show'
import { saveShowsList, ShowsChangedError } from '@/lib/save-shows'
import type { Show } from '@shared/types'
import type { ShowFormValues } from '@/lib/types'

interface ShowsPutBody {
  shows?: ShowFormValues[]
  /** shows.json version the page loaded. */
  version?: string
}

export const dynamic = 'force-dynamic'

export async function GET() {
  return withErrorResponse(
    { status: 500, headers: NO_STORE_HEADERS },
    async () => {
      const { content, sha } = await getShowsFile()
      const shows = (content.shows ?? []).map((show: Show) => ({
        ...show,
        provider: show.provider ?? 'crunchyroll',
      }))
      return NextResponse.json(
        { shows, showsVersion: sha },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}

export async function PUT(request: Request) {
  return withErrorResponse(
    {
      status: (error) => (error instanceof ShowsChangedError ? 409 : 400),
      headers: NO_STORE_HEADERS,
    },
    async () => {
      const body = (await request.json()) as ShowsPutBody
      const shows = (body.shows ?? []).map(normalizeShow)

      const ids = new Set<string>()
      for (const show of shows) {
        if (ids.has(show.id)) {
          throw new Error(`Duplicate show id: ${show.id}`)
        }
        ids.add(show.id)
      }

      if (!body.version) {
        throw new Error('version is required; reload the page')
      }

      const { version, removedIds } = await saveShowsList(shows, body.version)

      const cleanupTriggered =
        removedIds.length > 0 && (await tryDispatchCheckWorkflow(false))

      return NextResponse.json(
        {
          ok: true,
          shows,
          showsVersion: version,
          cleanupTriggered,
          removedIds,
        },
        { headers: NO_STORE_HEADERS }
      )
    }
  )
}
