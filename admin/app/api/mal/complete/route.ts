import { NextResponse } from 'next/server'
import { dispatchCheckWorkflow, getShowsFile, saveShowsFile } from '@/lib/github'
import { completeMalAnime } from '@/lib/mal'
import type { Show } from '@/lib/types'

interface MalCompleteBody {
  malId?: number
  showId?: string
  score?: number
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as MalCompleteBody
    const malId = body.malId
    const showId = body.showId?.trim()
    const score = body.score

    if (!Number.isFinite(malId) || malId! < 1) {
      throw new Error('malId must be a positive number')
    }

    if (!showId) {
      throw new Error('showId is required')
    }

    if (!Number.isInteger(score) || score! < 1 || score! > 10) {
      throw new Error('score must be an integer from 1 to 10')
    }

    await completeMalAnime(malId!, score!)

    const { content, sha } = await getShowsFile()
    const shows = (content.shows ?? []) as Show[]
    const show = shows.find((entry) => entry.id === showId)
    if (!show) {
      throw new Error(`Show not found: ${showId}`)
    }

    const nextShows = shows.filter((entry) => entry.id !== showId)
    await saveShowsFile(
      nextShows,
      sha,
      `chore: complete ${show.title || showId} on MAL`
    )

    let cleanupTriggered = false
    try {
      await dispatchCheckWorkflow(false)
      cleanupTriggered = true
    } catch (error) {
      console.warn('Failed to dispatch cleanup check workflow:', error)
    }

    return NextResponse.json({ ok: true, cleanupTriggered })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
