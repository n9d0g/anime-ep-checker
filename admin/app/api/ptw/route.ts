import { NextResponse } from 'next/server'
import { getStateFile, saveStateFile } from '@/lib/github'
import { fetchPlanToWatchAnime } from '@/lib/mal'
import type { PlanToWatchSnapshot, StateFile } from '@/lib/types'

async function saveStateWithRetry(state: StateFile): Promise<void> {
  let { sha } = await getStateFile()

  try {
    await saveStateFile(state, sha, 'chore: 🧹 refresh plan-to-watch snapshot from admin')
    return
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isConflict = message.includes('409') || message.includes('422')

    if (!isConflict) {
      throw error
    }
  }

  const refreshed = await getStateFile()
  await saveStateFile(
    state,
    refreshed.sha,
    'chore: 🧹 refresh plan-to-watch snapshot from admin'
  )
}

export async function GET() {
  try {
    const { content } = await getStateFile()
    const state = content as StateFile
    return NextResponse.json({
      planToWatch: state.meta?.planToWatch ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST() {
  try {
    const result = await fetchPlanToWatchAnime()

    if (result.status === 'not_configured') {
      return NextResponse.json(
        { error: 'MAL is not configured. Connect MAL from /mal first.' },
        { status: 400 }
      )
    }

    if (result.status === 'unavailable') {
      return NextResponse.json(
        { error: 'MAL plan-to-watch list is unavailable right now.' },
        { status: 502 }
      )
    }

    const updatedAt = new Date().toISOString()
    const snapshot: PlanToWatchSnapshot = {
      updatedAt,
      entries: result.entries,
    }

    const { content } = await getStateFile()
    const state = content as StateFile

    state.meta = {
      ...state.meta,
      planToWatch: snapshot,
      planToWatchCheckedAt: updatedAt,
    }

    await saveStateWithRetry(state)

    return NextResponse.json({ planToWatch: snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
