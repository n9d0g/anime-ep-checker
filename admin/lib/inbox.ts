import { getOfficialNewsUrl } from '@shared/shows'
import type { AnnouncedBreak, PlanToWatchSnapshotEntry } from '@shared/types'
import { getAnnouncedBreakSuggestion } from './announced-break'
import { formatReturn, type ReturningShow } from './awaiting-return'
import type { ShowFormValues, ShowStateSummary } from './types'
import { formScheduleToSchedule, usesMalProgress } from './watching'

/**
 * Something on the Watching page that only you can resolve. Still waiting,
 * provider lag, breaks and being behind are chips and badges, not inbox items.
 */
export type InboxItem =
  | {
      kind: 'announced_break'
      key: string
      showId: string
      title: string
      announced: AnnouncedBreak
      /** The whole-week break to add, or null for a TBA or odd-sized shift. */
      suggestedWeeks: number | null
    }
  | { kind: 'no_official_source'; key: string; showId: string; title: string }
  | { kind: 'mal_unlinked'; key: string; showId: string; title: string }
  | {
      kind: 'ptw_airing'
      key: string
      title: string
      entry: PlanToWatchSnapshotEntry
    }
  | {
      kind: 'return_announced'
      key: string
      showId: string
      title: string
      /** "Returns July 2027" and the like. */
      label: string
      sourceUrl: string | null
    }

export function buildInbox({
  shows,
  showStates,
  airingPlanToWatch,
  returningShows = [],
  dismissedKeys,
}: {
  /** Saved Watching shows (a new, unsaved show has nothing to resolve yet). */
  shows: ShowFormValues[]
  showStates: Record<string, ShowStateSummary>
  /** Plan to watch shows the checker alerted as having started airing. */
  airingPlanToWatch: PlanToWatchSnapshotEntry[]
  /** On hold shows whose return the checker announced. */
  returningShows?: ReturningShow[]
  /** Items put off with "Not now". */
  dismissedKeys: ReadonlySet<string>
}): InboxItem[] {
  const items: InboxItem[] = []

  for (const show of shows) {
    if (!show.id) {
      continue
    }
    const title = show.titleEnglish || show.title || show.id
    const liveState = showStates[show.id]

    const announced = liveState?.announcedBreak
    if (announced?.status === 'pending') {
      const suggestion = getAnnouncedBreakSuggestion(
        formScheduleToSchedule(show),
        announced,
        liveState.airingSchedule
      )
      items.push({
        kind: 'announced_break',
        key: `announced:${show.id}`,
        showId: show.id,
        title,
        announced,
        suggestedWeeks: suggestion?.weeks ?? null,
      })
    }

    // Null from AniList means it was checked and lists no official site.
    if (
      liveState?.officialSiteUrl === null &&
      !getOfficialNewsUrl(show, null)
    ) {
      items.push({
        kind: 'no_official_source',
        key: `news:${show.id}`,
        showId: show.id,
        title,
      })
    }

    if (!usesMalProgress(show)) {
      items.push({
        kind: 'mal_unlinked',
        key: `mal:${show.id}`,
        showId: show.id,
        title,
      })
    }
  }

  const watchingMalIds = new Set(
    shows.map((show) => show.malId.trim()).filter(Boolean)
  )
  for (const entry of airingPlanToWatch) {
    const key = `airing:${entry.malId}`
    // The checker's alert stays while the show is on the list; once it has
    // finished airing it's no longer news.
    if (
      entry.status !== 'currently_airing' ||
      dismissedKeys.has(key) ||
      watchingMalIds.has(String(entry.malId))
    ) {
      continue
    }
    items.push({
      kind: 'ptw_airing',
      key,
      title: entry.titleEnglish || entry.title,
      entry,
    })
  }

  for (const { entry, announcement } of returningShows) {
    // Keyed by the date, so "Not now" lasts only until the next new date.
    const when = announcement.returnsOn ?? announcement.returnsIn ?? 'tba'
    const key = `return:${entry.show.id}:${when}`
    if (dismissedKeys.has(key)) {
      continue
    }
    items.push({
      kind: 'return_announced',
      key,
      showId: entry.show.id,
      title: entry.show.titleEnglish || entry.show.title || entry.show.id,
      label: formatReturn(announcement),
      sourceUrl: announcement.sourceUrl,
    })
  }

  return items
}
