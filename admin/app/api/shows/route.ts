import { NextResponse } from 'next/server'
import {
  dispatchCheckWorkflow,
  getShowsFile,
  NO_STORE_HEADERS,
} from '@/lib/github'
import { normalizeShow } from '@/lib/normalize-show'
import { saveShowsList, ShowsChangedError } from '@/lib/save-shows'
import type { Show, ShowFormValues } from '@/lib/types'

interface ShowsPutBody {
  shows?: ShowFormValues[]
  /** shows.json version the page loaded. */
  version?: string
}

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { content, sha } = await getShowsFile()
    const shows = (content.shows ?? []).map((show: Show) => ({
      ...show,
      provider: show.provider ?? 'crunchyroll',
    }))
    return NextResponse.json(
      { shows, showsVersion: sha },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 500, headers: NO_STORE_HEADERS }
    )
  }
}

export async function PUT(request: Request) {
  try {
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

    let cleanupTriggered = false
    if (removedIds.length > 0) {
      try {
        await dispatchCheckWorkflow(false)
        cleanupTriggered = true
      } catch (error) {
        console.warn('Failed to dispatch cleanup check workflow:', error)
      }
    }

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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = error instanceof ShowsChangedError ? 409 : 400
    return NextResponse.json(
      { error: message },
      { status, headers: NO_STORE_HEADERS }
    )
  }
}
