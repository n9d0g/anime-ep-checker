import { NextResponse } from 'next/server'
import {
  getShowsFile,
  parseSeriesIdFromUrl,
  saveShowsFile,
  slugify,
} from '../../../lib/github.js'

function normalizeShow(show) {
  const seriesId = show.seriesId || parseSeriesIdFromUrl(show.crunchyrollUrl)
  if (!seriesId) {
    throw new Error(`Invalid Crunchyroll URL: ${show.crunchyrollUrl}`)
  }

  const id = show.id || slugify(show.title || seriesId)
  return {
    id,
    title: show.title?.trim() || '',
    crunchyrollUrl: show.crunchyrollUrl?.trim(),
    seriesId,
    expectedDropAt: show.expectedDropAt || null,
  }
}

export async function GET() {
  try {
    const { content } = await getShowsFile()
    return NextResponse.json(content)
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    const body = await request.json()
    const shows = (body.shows ?? []).map(normalizeShow)

    const ids = new Set()
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
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
