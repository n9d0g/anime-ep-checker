import { NextResponse } from 'next/server'
import {
  getShowsFile,
  parseNetflixIdFromUrl,
  parseSeriesIdFromUrl,
  saveShowsFile,
  slugify,
} from '@/lib/github'
import type { Show, ShowFormValues, ShowProvider } from '@/lib/types'
import { fromDatetimeLocalValue } from '@/lib/types'

interface ShowsPutBody {
  shows?: ShowFormValues[]
}

function normalizeShow(show: ShowFormValues): Show {
  const provider: ShowProvider = show.provider ?? 'crunchyroll'
  const title = show.title.trim()

  let seriesId: string | undefined
  let crunchyrollUrl: string | undefined
  let netflixId: string | undefined
  let netflixUrl: string | undefined

  if (provider === 'crunchyroll') {
    crunchyrollUrl = show.crunchyrollUrl.trim()
    seriesId = show.seriesId || parseSeriesIdFromUrl(crunchyrollUrl) || undefined
    if (!seriesId) {
      throw new Error(`Invalid Crunchyroll URL: ${show.crunchyrollUrl}`)
    }
  } else {
    netflixUrl = show.netflixUrl.trim()
    netflixId = show.netflixId || parseNetflixIdFromUrl(netflixUrl) || undefined
    if (!netflixId) {
      throw new Error(`Invalid Netflix URL: ${show.netflixUrl}`)
    }
  }

  const startAt = fromDatetimeLocalValue(show.schedule.startAt)
  if (!startAt) {
    throw new Error(`Start date is required for ${title || seriesId || netflixId}`)
  }

  const startEpisode = Number(show.schedule.startEpisode)
  if (!Number.isFinite(startEpisode) || startEpisode < 1) {
    throw new Error(
      `Start episode must be at least 1 for ${title || seriesId || netflixId}`
    )
  }

  const premiereBatchSize = Number(show.schedule.premiereBatchSize || '1')
  if (!Number.isFinite(premiereBatchSize) || premiereBatchSize < 1) {
    throw new Error(
      `Premiere batch size must be at least 1 for ${title || seriesId || netflixId}`
    )
  }

  const mode = show.schedule.mode
  let episodeCount: number | null = null

  if (mode === 'finite') {
    episodeCount = Number(show.schedule.episodeCount)
    if (!Number.isFinite(episodeCount) || episodeCount < 1) {
      throw new Error('Episode count is required for finite seasons')
    }
  }

  const malIdRaw = show.malId.trim()
  let malId: number | undefined
  if (malIdRaw) {
    malId = Number(malIdRaw)
    if (!Number.isFinite(malId) || malId < 1) {
      throw new Error(`MAL anime ID must be a positive number for ${title}`)
    }
  }

  const redditSearchTitle = show.redditSearchTitle.trim() || undefined
  const id =
    show.id ||
    slugify(title || seriesId || netflixId || 'show')

  const normalized: Show = {
    id,
    title,
    provider,
    schedule: {
      mode,
      startAt,
      startEpisode,
      episodeCount,
      premiereBatchSize,
    },
  }

  if (provider === 'crunchyroll') {
    normalized.crunchyrollUrl = crunchyrollUrl
    normalized.seriesId = seriesId
  } else {
    normalized.netflixUrl = netflixUrl
    normalized.netflixId = netflixId
  }

  if (malId !== undefined) {
    normalized.malId = malId
  }
  if (redditSearchTitle) {
    normalized.redditSearchTitle = redditSearchTitle
  }

  return normalized
}

export async function GET() {
  try {
    const { content } = await getShowsFile()
    const shows = (content.shows ?? []).map((show: Show) => ({
      ...show,
      provider: show.provider ?? 'crunchyroll',
    }))
    return NextResponse.json({ shows })
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
