import { NextResponse } from 'next/server'
import { getStateFile, updateRepoFiles } from '@/lib/github'
import { fetchPlanToWatchAnime } from '@/lib/mal'
import type { PlanToWatchSnapshot, StateFile } from '@/lib/types'

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

    await updateRepoFiles(
      ['state.json'],
      ({ 'state.json': state }) => {
        state.meta = {
          ...state.meta,
          planToWatch: snapshot,
          planToWatchCheckedAt: updatedAt,
        }
        return { 'state.json': state }
      },
      'chore: 🧹 refresh plan-to-watch snapshot from admin'
    )

    return NextResponse.json({ planToWatch: snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
