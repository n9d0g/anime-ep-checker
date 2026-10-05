import { NextResponse } from 'next/server'
import {
  dispatchCheckWorkflow,
  getShowsFile,
  getStateFile,
  isGithubConflictError,
  saveShowsFileRetrying,
  saveStateFile,
} from '@/lib/github'
import { setMalWatchingStatus } from '@/lib/mal'
import { normalizeShow } from '@/lib/normalize-show'
import { uniqueShowId } from '@/lib/ptw-watch'
import type { Show, ShowFormValues, StateFile } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface PtwWatchBody {
  malId?: number
  title?: string
  titleEnglish?: string
  provider?: ShowFormValues['provider']
  crunchyrollUrl?: string
  netflixUrl?: string
  disneyUrl?: string
  schedule?: ShowFormValues['schedule']
}

async function saveStateWithRetry(state: StateFile, message: string) {
  let { sha } = await getStateFile()

  try {
    await saveStateFile(state, sha, message)
    return
  } catch (error) {
    if (!isGithubConflictError(error)) {
      throw error
    }
  }

  const refreshed = await getStateFile()
  await saveStateFile(state, refreshed.sha, message)
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PtwWatchBody
    const malId = Number(body.malId)
    const title = body.title?.trim() ?? ''

    if (!Number.isFinite(malId) || malId < 1) {
      throw new Error('malId must be a positive number')
    }

    if (!title) {
      throw new Error('title is required')
    }

    if (!body.provider || !body.schedule) {
      throw new Error('provider and schedule are required')
    }

    const { content } = await getShowsFile()
    const shows = (content.shows ?? []) as Show[]

    if (shows.some((show) => show.malId === malId)) {
      throw new Error('This show is already on the watching list')
    }

    const existingIds = new Set(shows.map((show) => show.id))
    const show = normalizeShow({
      id: uniqueShowId(title, malId, existingIds),
      title,
      titleEnglish: body.titleEnglish?.trim() || undefined,
      provider: body.provider,
      crunchyrollUrl: body.crunchyrollUrl ?? '',
      seriesId: '',
      netflixUrl: body.netflixUrl ?? '',
      netflixId: '',
      disneyUrl: body.disneyUrl ?? '',
      disneyId: '',
      malId: String(malId),
      redditSearchTitle: '',
      schedule: body.schedule,
    })

    await saveShowsFileRetrying(
      [...shows, show],
      `chore: move ${show.title} from plan-to-watch to watching`
    )

    let malUpdated = false
    try {
      await setMalWatchingStatus(malId)
      malUpdated = true
    } catch (error) {
      console.warn('Failed to mark MAL status watching:', error)
    }

    const { content: stateContent } = await getStateFile()
    const state = stateContent as StateFile

    if (state.meta?.planToWatch?.entries) {
      state.meta.planToWatch = {
        ...state.meta.planToWatch,
        entries: state.meta.planToWatch.entries.filter(
          (entry) => entry.malId !== malId
        ),
      }
    }

    if (state.meta?.planToWatchAlerts) {
      delete state.meta.planToWatchAlerts[String(malId)]
    }

    await saveStateWithRetry(
      state,
      `chore: 🧹 remove ${show.title} from plan-to-watch snapshot`
    )

    let workflowTriggered = false
    try {
      await dispatchCheckWorkflow(true)
      workflowTriggered = true
    } catch (error) {
      console.warn('Failed to dispatch check workflow:', error)
    }

    return NextResponse.json({
      ok: true,
      show,
      malUpdated,
      workflowTriggered,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
