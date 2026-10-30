import { buildAnimeDiscussionSearchUrl } from '@shared/reddit'
import {
  getExpectedDropAt,
  getLastScheduledEpisode,
  getNextDrop,
  isEpisodeInSchedule,
} from '@shared/schedule'
import { emptyShowForm } from './show-form'
import { getShowWatchUrl } from '@shared/shows'
import { getScheduleChip, type ScheduleChip } from './schedule-chip'
import {
  formatDropTime,
  formatEasternDateTime,
  fromDatetimeLocalValue,
} from './time'
import type { Show, ShowProvider, ShowSchedule } from '@shared/types'
import type { ShowFormValues, ShowStateSummary } from './types'

export const MAL_DOWN_MESSAGE =
  'MAL servers are down. Progress can’t be loaded or changed.'

// A show in the Watching list. The key is client-only, so rows keep their
// expand/edit state while reordering and before a new show has an ID.
export interface ShowRow {
  key: string
  values: ShowFormValues
}

let newRowCount = 0

export function newShowRow(): ShowRow {
  newRowCount += 1
  return { key: `new:${newRowCount}`, values: emptyShowForm() }
}

export function showRowKey(showId: string): string {
  return `show:${showId}`
}

export function toShowRows(shows: ShowFormValues[]): ShowRow[] {
  return shows.map((values) =>
    values.id
      ? { key: showRowKey(values.id), values }
      : { ...newShowRow(), values }
  )
}

/** Puts the server's copy of one show into its row; other rows (and their edits) are untouched. */
export function replaceShowInRows(
  rows: ShowRow[],
  show: ShowFormValues
): ShowRow[] {
  return rows.map((row) =>
    row.values.id === show.id ? { ...row, values: show } : row
  )
}

export function showRowValues(rows: ShowRow[]): ShowFormValues[] {
  return rows.map((row) => row.values)
}

export function serializeShows(shows: ShowFormValues[]): string {
  return JSON.stringify(shows)
}

export function providerDotClass(provider: ShowProvider): string {
  if (provider === 'netflix') return 'provider-nf'
  if (provider === 'disney') return 'provider-disney'
  return 'provider-cr'
}

export function formScheduleToSchedule(show: ShowFormValues): ShowSchedule {
  const startAt = fromDatetimeLocalValue(show.schedule.startAt) ?? ''

  return {
    mode: show.schedule.mode,
    startAt,
    startEpisode: Number(show.schedule.startEpisode) || 1,
    episodeCount:
      show.schedule.mode === 'ongoing'
        ? null
        : Number(show.schedule.episodeCount) || null,
    premiereBatchSize: Number(show.schedule.premiereBatchSize) || 1,
    ...(show.schedule.breaks?.length ? { breaks: show.schedule.breaks } : {}),
  }
}

export function showFormToWatchInput(show: ShowFormValues): Show {
  return {
    id: show.id,
    title: show.title,
    provider: show.provider,
    crunchyrollUrl: show.crunchyrollUrl || undefined,
    seriesId: show.seriesId || undefined,
    netflixUrl: show.netflixUrl || undefined,
    netflixId: show.netflixId || undefined,
    disneyUrl: show.disneyUrl || undefined,
    disneyId: show.disneyId || undefined,
    schedule: formScheduleToSchedule(show),
  }
}

export function usesMalProgress(show: ShowFormValues): boolean {
  return Boolean(show.malId.trim())
}

export function getWatchedEpisode(liveState?: ShowStateSummary): number | null {
  if (
    liveState?.watchedEpisode !== undefined &&
    liveState.watchedEpisode !== null &&
    Number.isFinite(liveState.watchedEpisode)
  ) {
    return liveState.watchedEpisode
  }

  return null
}

function getLatestOut(liveState?: ShowStateSummary): number | null {
  const latestOut = liveState?.lastEpisodeNumber
    ? Number(liveState.lastEpisodeNumber)
    : null

  return latestOut !== null && Number.isFinite(latestOut) ? latestOut : null
}

export function getProgressEpisode(
  show: ShowFormValues,
  liveState?: ShowStateSummary
): number | null {
  if (usesMalProgress(show)) {
    return getWatchedEpisode(liveState)
  }

  return getLatestOut(liveState)
}

export function getNextEpisodeToWatch(
  show: ShowFormValues,
  liveState?: ShowStateSummary
): number | null {
  const watched = getProgressEpisode(show, liveState)
  const latestOut = getLatestOut(liveState)

  if (watched !== null && Number.isFinite(watched)) {
    if (latestOut !== null && watched < latestOut) {
      return watched + 1
    }

    return latestOut ?? watched
  }

  return latestOut
}

export interface EpisodeBadge {
  label: string
  behind: boolean
  malDown?: boolean
}

function episodeBadgeFor(
  show: ShowFormValues,
  schedule: ShowSchedule,
  liveState: ShowStateSummary | undefined,
  malDown: boolean
): EpisodeBadge {
  const lastScheduled = getLastScheduledEpisode(schedule)
  const latestOut = getLatestOut(liveState)
  const watched = getWatchedEpisode(liveState)
  const withTotal = (episode: number | string) =>
    lastScheduled !== null ? `Ep ${episode}/${lastScheduled}` : `Ep ${episode}`

  // Without this, the badge falls back to the latest aired episode and looks
  // like real watch progress while MAL is unreachable.
  if (watched === null && malDown && usesMalProgress(show)) {
    return { label: 'MAL down', behind: false, malDown: true }
  }

  if (watched !== null) {
    return {
      label: withTotal(watched),
      behind: latestOut !== null && watched < latestOut,
    }
  }

  if (latestOut !== null) {
    return { label: withTotal(latestOut), behind: false }
  }

  const start = show.schedule.startEpisode || '?'

  if (show.schedule.mode === 'ongoing') {
    return { label: `Ep ${start}`, behind: false }
  }

  return { label: withTotal(start), behind: false }
}

export function episodeBadge(
  show: ShowFormValues,
  liveState: ShowStateSummary | undefined,
  malDown: boolean
): EpisodeBadge {
  return episodeBadgeFor(show, formScheduleToSchedule(show), liveState, malDown)
}

export function getEpisodeBounds(show: ShowFormValues): {
  min: number
  max: number | null
} {
  return episodeBoundsFor(formScheduleToSchedule(show))
}

function episodeBoundsFor(schedule: ShowSchedule): {
  min: number
  max: number | null
} {
  const min = Math.max(1, schedule.startEpisode - 1)
  const max = getLastScheduledEpisode(schedule)
  return { min, max }
}

// The episode a +/- step lands on, or null when the step leaves the schedule.
// `current` is the progress the stepper shows (MAL watched or last aired).
export function stepEpisode(
  show: ShowFormValues,
  current: number | null,
  delta: number
): { base: number; next: number; max: number | null } | null {
  if (!show.id) {
    return null
  }

  const schedule = formScheduleToSchedule(show)
  const base = Number.isFinite(current ?? NaN)
    ? (current as number)
    : schedule.startEpisode - 1
  const next = base + delta
  const { min, max } = episodeBoundsFor(schedule)

  if (next < min) {
    return null
  }

  if (max !== null && next > max) {
    return null
  }

  if (!isEpisodeInSchedule(schedule, next) && next !== min) {
    return null
  }

  return { base, next, max }
}

// The next drop (episode and time), or null when the show has no start time.
function nextScheduledDrop(
  schedule: ShowSchedule,
  liveState?: ShowStateSummary
): { episode: number | null; at: Date | null } | null {
  if (!schedule.startAt) {
    return null
  }

  // An empty saved episode means no episode yet, as does no live state.
  const nextDrop = getNextDrop(
    schedule,
    liveState?.lastEpisodeNumber || null,
    liveState?.airingSchedule
  )

  return {
    episode: nextDrop?.episode ?? null,
    at: nextDrop?.expectedAt ?? null,
  }
}

function getNextDropTime(
  show: ShowFormValues,
  liveState?: ShowStateSummary
): number | null {
  return (
    nextScheduledDrop(formScheduleToSchedule(show), liveState)?.at?.getTime() ??
    null
  )
}

const UPCOMING_DROP_COUNT = 3

// The next drop and the ones after it, while the schedule has them.
function getUpcomingDrops(
  schedule: ShowSchedule,
  nextEpisode: number | null,
  liveState: ShowStateSummary | undefined,
  now: Date
): { episode: number; when: string }[] {
  if (nextEpisode === null) {
    return []
  }
  const drops: { episode: number; when: string }[] = []
  for (let offset = 0; offset < UPCOMING_DROP_COUNT; offset += 1) {
    const episode = nextEpisode + offset
    const at = getExpectedDropAt(schedule, episode, liveState?.airingSchedule)
    const when = at ? formatDropTime(at, now) : null
    if (!when) {
      break
    }
    drops.push({ episode, when })
  }
  return drops
}

export interface ShowViewModel {
  providerDotClass: string
  // "Ep 3 · in 2d · Wed 11:00 AM ET" under the title.
  nextDropLine: string | null
  // The row's one schedule state (announced break, still waiting, ...).
  chip: ScheduleChip | null
  // The next few drops for the sheet's Schedule section.
  upcomingDrops: { episode: number; when: string }[]
  // Eastern conversion of the start time, shown under the start field.
  startHint: string | null
  nextDropTime: number | null
  badge: EpisodeBadge
  currentEpisode: number | null
  nextEpisodeToWatch: number | null
  bounds: { min: number; max: number | null }
  watchUrl: string
  discussionUrl: string | null
  malUrl: string | null
  malLinked: boolean
  // MAL is down and this show's progress lives on MAL.
  malBlocked: boolean
}

export function buildShowViewModel(
  show: ShowFormValues,
  liveState: ShowStateSummary | undefined,
  malDown: boolean,
  now: Date = new Date()
): ShowViewModel {
  const schedule = formScheduleToSchedule(show)
  const drop = nextScheduledDrop(schedule, liveState)
  const currentEpisode = getProgressEpisode(show, liveState)
  const malLinked = usesMalProgress(show)

  let nextDropLine: string | null = null
  let startHint: string | null = null
  if (drop) {
    const eastern = `Eastern: ${formatEasternDateTime(schedule.startAt, now)}`
    if (drop.episode === null) {
      nextDropLine = 'No further episodes on schedule'
      startHint = `${eastern} · No further episodes on schedule`
    } else if (!drop.at) {
      nextDropLine = `Ep ${drop.episode} next`
      startHint = eastern
    } else {
      const when = formatDropTime(drop.at, now)
      nextDropLine = `Ep ${drop.episode} · ${when}`
      startHint = `${eastern} · Next ep ${drop.episode}: ${when}`
    }
  }

  return {
    providerDotClass: providerDotClass(show.provider),
    nextDropLine,
    chip: getScheduleChip(schedule, liveState, now),
    upcomingDrops: getUpcomingDrops(
      schedule,
      drop?.episode ?? null,
      liveState,
      now
    ),
    startHint,
    nextDropTime: drop?.at?.getTime() ?? null,
    badge: episodeBadgeFor(show, schedule, liveState, malDown),
    currentEpisode,
    nextEpisodeToWatch: getNextEpisodeToWatch(show, liveState),
    bounds: episodeBoundsFor(schedule),
    watchUrl: getShowWatchUrl(showFormToWatchInput(show)),
    discussionUrl:
      currentEpisode !== null && Number.isFinite(currentEpisode)
        ? buildAnimeDiscussionSearchUrl(
            show.title || show.id,
            currentEpisode,
            show.redditSearchTitle || undefined
          )
        : null,
    malUrl: show.malId ? `https://myanimelist.net/anime/${show.malId}` : null,
    malLinked,
    malBlocked: malDown && malLinked,
  }
}

// Orders the list by each show's next drop as last loaded or saved, so a row
// doesn't move while its start time is being edited. Shows without a next
// drop, including new unsaved ones, follow in list order.
export function orderRowsBySavedNextDrop(
  rows: ShowRow[],
  savedRows: ShowRow[],
  showStates: Record<string, ShowStateSummary>
): Array<{ row: ShowRow; index: number }> {
  const savedDropTimes = new Map<string, number | null>()
  for (const saved of savedRows) {
    savedDropTimes.set(
      saved.key,
      getNextDropTime(
        saved.values,
        saved.values.id ? showStates[saved.values.id] : undefined
      )
    )
  }

  return rows
    .map((row, index) => ({
      row,
      index,
      time: savedDropTimes.get(row.key) ?? null,
    }))
    .sort((a, b) => {
      if (a.time === null && b.time === null) return a.index - b.index
      if (a.time === null) return 1
      if (b.time === null) return -1
      if (a.time !== b.time) return a.time - b.time
      return a.index - b.index
    })
    .map(({ row, index }) => ({ row, index }))
}
