import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import { getStateFile, updateRepoFiles } from '@/lib/github'
import { fetchPlanToWatchAnime } from '@/lib/mal'
import type { PlanToWatchSnapshot, StateFile } from '@/lib/types'

export async function GET() {
  return withErrorResponse({ status: 500 }, async () => {
    const { content } = await getStateFile()
    const state = content as StateFile
    return NextResponse.json({
      planToWatch: state.meta?.planToWatch ?? null,
    })
  })
}

export async function POST() {
  return withErrorResponse({ status: 500 }, async () => {
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
  })
}
