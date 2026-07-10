import { NextResponse } from 'next/server'
import {
  getShowsFile,
  parseSeriesIdFromUrl,
  saveShowsFile,
  slugify,
} from '@/lib/github'
import type { Show, ShowFormValues } from '@/lib/types'
import { fromDatetimeLocalValue } from '@/lib/types'

interface ShowsPutBody {
  shows?: ShowFormValues[]
}

function normalizeShow(show: ShowFormValues): Show {
  const seriesId = show.seriesId || parseSeriesIdFromUrl(show.crunchyrollUrl)
  if (!seriesId) {
    throw new Error(`Invalid Crunchyroll URL: ${show.crunchyrollUrl}`)
  }

  const startAt = fromDatetimeLocalValue(show.schedule.startAt)
  if (!startAt) {
    throw new Error(`Start date is required for ${show.title || seriesId}`)
  }

  const startEpisode = Number(show.schedule.startEpisode)
  if (!Number.isFinite(startEpisode) || startEpisode < 1) {
    throw new Error(`Start episode must be at least 1 for ${show.title || seriesId}`)
  }

  const premiereBatchSize = Number(show.schedule.premiereBatchSize || '1')
  if (!Number.isFinite(premiereBatchSize) || premiereBatchSize < 1) {
    throw new Error(
      `Premiere batch size must be at least 1 for ${show.title || seriesId}`
    )
  }

  const mode = show.schedule.mode
  let episodeCount: number | null = null

  if (mode === 'finite') {
    episodeCount = Number(show.schedule.episodeCount)
    if (!Number.isFinite(episodeCount) || episodeCount < 1) {
      throw new Error(`Episode count is required for finite seasons`)
    }
  }

  const id = show.id || slugify(show.title || seriesId)

  return {
    id,
    title: show.title.trim(),
    crunchyrollUrl: show.crunchyrollUrl.trim(),
    seriesId,
    schedule: {
      mode,
      startAt,
      startEpisode,
      episodeCount,
      premiereBatchSize,
    },
  }
}

export async function GET() {
  try {
    const { content } = await getShowsFile()
    return NextResponse.json(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
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

    const { sha } = await getShowsFile()
    await saveShowsFile(shows, sha)
    return NextResponse.json({ ok: true, shows })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
