import { NextResponse } from 'next/server'
import { dispatchCheckWorkflow, updateRepoFiles } from '@/lib/github'
import { setMalWatchingStatus } from '@/lib/mal'
import { normalizeShow } from '@/lib/normalize-show'
import { uniqueShowId } from '@/lib/ptw-watch'
import type { Show, ShowFormValues } from '@/lib/types'

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

    const { provider, schedule } = body
    let show: Show | undefined
    await updateRepoFiles(
      ['shows.json', 'state.json'],
      ({ 'shows.json': showsFile, 'state.json': state }) => {
        const shows = showsFile.shows ?? []
        if (shows.some((entry) => entry.malId === malId)) {
          throw new Error('This show is already on the watching list')
        }

        const existingIds = new Set(shows.map((entry) => entry.id))
        show = normalizeShow({
          id: uniqueShowId(title, malId, existingIds),
          title,
          titleEnglish: body.titleEnglish?.trim() || undefined,
          provider,
          crunchyrollUrl: body.crunchyrollUrl ?? '',
          seriesId: '',
          netflixUrl: body.netflixUrl ?? '',
          netflixId: '',
          disneyUrl: body.disneyUrl ?? '',
          disneyId: '',
          malId: String(malId),
          redditSearchTitle: '',
          schedule,
        })

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

        return {
          'shows.json': { ...showsFile, shows: [...shows, show] },
          'state.json': state,
        }
      },
      `chore: move ${title} from plan-to-watch to watching`
    )

    let malUpdated = false
    try {
      await setMalWatchingStatus(malId)
      malUpdated = true
    } catch (error) {
      console.warn('Failed to mark MAL status watching:', error)
    }

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
