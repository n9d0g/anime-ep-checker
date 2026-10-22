import { NextResponse } from 'next/server'
import { withErrorResponse } from '@/lib/api-route'
import { getRepoFiles, NO_STORE_HEADERS } from '@/lib/github'
import { fetchCompletedAnime } from '@/lib/mal'
import type { SearchIndexItem } from '@/lib/search'
import type { Show, StateFile } from '@shared/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  return withErrorResponse(
    { status: 500, headers: NO_STORE_HEADERS },
    async () => {
      const [{ files }, completed] = await Promise.all([
        getRepoFiles(['shows.json', 'state.json']),
        // Search still works for tracked lists if MAL is unavailable.
        fetchCompletedAnime().catch((error) => {
          console.warn('Watched list unavailable for search:', error)
          return []
        }),
      ])
      const shows = ((files['shows.json']?.content as { shows?: Show[] })
        ?.shows ?? []) as Show[]
      const state = (files['state.json']?.content ?? { shows: {} }) as StateFile

      const items: SearchIndexItem[] = []

      for (const show of shows) {
        items.push({
          category: 'watching',
          id: show.id,
          title: show.title,
          titleEnglish: show.titleEnglish,
          href: `/#show-${show.id}`,
        })
      }

      for (const entry of state.meta?.planToWatch?.entries ?? []) {
        items.push({
          category: 'ptw',
          id: String(entry.malId),
          title: entry.title,
          titleEnglish: entry.titleEnglish,
          href: `/ptw#show-${entry.malId}`,
        })
      }

      for (const entry of state.meta?.onHold?.entries ?? []) {
        items.push({
          category: 'on_hold',
          id: entry.show.id,
          title: entry.show.title,
          titleEnglish: entry.show.titleEnglish,
          href: `/on-hold#show-${entry.show.id}`,
        })
      }

      for (const entry of completed) {
        items.push({
          category: 'watched',
          id: String(entry.malId),
          title: entry.title,
          titleEnglish: entry.titleEnglish,
          href: `/watched#show-${entry.malId}`,
        })
      }

      return NextResponse.json({ items }, { headers: NO_STORE_HEADERS })
    }
  )
}
