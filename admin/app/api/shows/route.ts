import { NextResponse } from 'next/server'
import {
  dispatchCheckWorkflow,
  getShowsFile,
  NO_STORE_HEADERS,
  saveShowsFileRetrying,
} from '@/lib/github'
import { normalizeShow } from '@/lib/normalize-show'
import type { Show, ShowFormValues } from '@/lib/types'

interface ShowsPutBody {
  shows?: ShowFormValues[]
}

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { content } = await getShowsFile()
    const shows = (content.shows ?? []).map((show: Show) => ({
      ...show,
      provider: show.provider ?? 'crunchyroll',
    }))
    return NextResponse.json({ shows }, { headers: NO_STORE_HEADERS })
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

    const { content } = await getShowsFile()
    const previousIds = new Set(
      ((content.shows ?? []) as Show[]).map((show) => show.id)
    )

    await saveShowsFileRetrying(shows)

    const newIds = new Set(shows.map((show) => show.id))
    const removedIds = [...previousIds].filter((id) => !newIds.has(id))

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
        cleanupTriggered,
        removedIds,
      },
      { headers: NO_STORE_HEADERS }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: message },
      { status: 400, headers: NO_STORE_HEADERS }
    )
  }
}
