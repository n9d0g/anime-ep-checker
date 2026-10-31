import type {
  AiringSchedule,
  OnHoldSnapshotEntry,
  Show,
  ShowSchedule,
  StateFile,
} from './types.ts'
import { EASTERN_TZ } from './time-zone.ts'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
const DROP_WINDOW_BEFORE_MS = 5 * 60 * 1000
const DROP_WINDOW_AFTER_MS = 90 * 60 * 1000
const LATE_SLOT_INTERVAL_MS = 30 * 60 * 1000
const CRON_INTERVAL_MS = 5 * 60 * 1000
const WAITING_GRACE_MS = 15 * 60 * 1000
const PTW_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const RETURN_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

function getPremiereBatchSize(schedule: ShowSchedule): number {
  return schedule.premiereBatchSize > 0 ? schedule.premiereBatchSize : 1
}

export function getLastScheduledEpisode(schedule: ShowSchedule): number | null {
  if (schedule.mode === 'ongoing' || schedule.episodeCount === null) {
    return null
  }
  return schedule.startEpisode + schedule.episodeCount - 1
}

export function isEpisodeInSchedule(
  schedule: ShowSchedule,
  episodeNumber: number
): boolean {
  if (episodeNumber < schedule.startEpisode) {
    return false
  }

  const lastEpisode = getLastScheduledEpisode(schedule)
  if (lastEpisode !== null && episodeNumber > lastEpisode) {
    return false
  }

  return true
}

/** startAt for the premiere batch, then one week per episode (no breaks). */
function getWeeklyDropMs(
  startMs: number,
  batchEnd: number,
  episodeNumber: number
): number {
  return startMs + Math.max(0, episodeNumber - batchEnd) * MS_PER_WEEK
}

function getAiringMs(
  airingSchedule: AiringSchedule | null | undefined,
  episodeNumber: number
): number | null {
  const value = airingSchedule?.episodes[String(episodeNumber)]
  if (!value) {
    return null
  }
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

/** AniList's broadcast time for an episode, or null if it has none. */
export function getBroadcastAt(
  airingSchedule: AiringSchedule | null | undefined,
  episodeNumber: number
): Date | null {
  const ms = getAiringMs(airingSchedule, episodeNumber)
  return ms === null ? null : new Date(ms)
}

/**
 * The extra weeks AniList's broadcast schedule shows between an episode and
 * the next (0 for a normal week, or when AniList lacks either time).
 */
export function getAniListGapWeeks(
  airingSchedule: AiringSchedule | null | undefined,
  afterEpisode: number
): number {
  const before = getAiringMs(airingSchedule, afterEpisode)
  const after = getAiringMs(airingSchedule, afterEpisode + 1)
  if (before === null || after === null) {
    return 0
  }
  return Math.max(0, Math.round((after - before) / MS_PER_WEEK) - 1)
}

/**
 * Weeks that manual breaks before the episode add to its base drop time. The
 * base already follows AniList's gaps, so a break only adds what AniList's
 * gap after the same episode doesn't cover, unless it's `onTopOfAniList`.
 */
function getBreakWeeksBefore(
  schedule: ShowSchedule,
  episodeNumber: number,
  airingSchedule: AiringSchedule | null | undefined
): number {
  let weeks = 0
  for (const entry of schedule.breaks ?? []) {
    if (episodeNumber > entry.afterEpisode) {
      weeks += entry.onTopOfAniList
        ? entry.weeks
        : Math.max(
            0,
            entry.weeks - getAniListGapWeeks(airingSchedule, entry.afterEpisode)
          )
    }
  }
  return weeks
}

/**
 * The drop time before manual breaks: AniList's broadcast time plus the
 * provider's offset from broadcast, continuing weekly from the last episode
 * AniList has a time for; the weekly formula when AniList has no time for
 * the premiere batch's last episode (the offset's anchor).
 */
function getBaseDropMs(
  schedule: ShowSchedule,
  startMs: number,
  batchEnd: number,
  episodeNumber: number,
  airingSchedule: AiringSchedule | null | undefined
): number {
  const weeklyMs = getWeeklyDropMs(startMs, batchEnd, episodeNumber)
  const anchorAiringMs = getAiringMs(airingSchedule, batchEnd)
  if (episodeNumber <= batchEnd || anchorAiringMs === null) {
    return weeklyMs
  }

  const providerOffsetMs = toTimeOfDayOffset(
    getWeeklyDropMs(startMs, batchEnd, batchEnd) - anchorAiringMs
  )
  for (let known = episodeNumber; known >= batchEnd; known--) {
    const airingMs = getAiringMs(airingSchedule, known)
    if (airingMs !== null) {
      return airingMs + providerOffsetMs + (episodeNumber - known) * MS_PER_WEEK
    }
  }
  return weeklyMs
}

/**
 * When an episode should drop, or null outside the schedule or with an
 * invalid start time: the base time (AniList-derived when the show has an
 * airing schedule, otherwise the weekly formula) shifted by the manual
 * breaks before the episode that AniList's gaps don't already cover.
 */
export function getExpectedDropAt(
  schedule: ShowSchedule,
  episodeNumber: number,
  airingSchedule?: AiringSchedule | null
): Date | null {
  if (!isEpisodeInSchedule(schedule, episodeNumber)) {
    return null
  }

  const startMs = new Date(schedule.startAt).getTime()
  if (Number.isNaN(startMs)) {
    return null
  }

  const batchEnd = schedule.startEpisode + getPremiereBatchSize(schedule) - 1
  const baseMs = getBaseDropMs(
    schedule,
    startMs,
    batchEnd,
    episodeNumber,
    airingSchedule
  )
  return new Date(
    baseMs +
      getBreakWeeksBefore(schedule, episodeNumber, airingSchedule) * MS_PER_WEEK
  )
}

const OFFSET_EARLIEST_MS = -24 * 60 * 60 * 1000

/**
 * The configured start can sit whole weeks away from the broadcast premiere
 * (e.g. a provider that started late but now streams an hour after Japan), so
 * only the offset within a week is kept: from a day before broadcast to six
 * days after. A provider that is really a week or more behind broadcast is
 * modelled with a manual break.
 */
function toTimeOfDayOffset(offsetMs: number): number {
  const withinWeek =
    (((offsetMs - OFFSET_EARLIEST_MS) % MS_PER_WEEK) + MS_PER_WEEK) %
    MS_PER_WEEK
  return withinWeek + OFFSET_EARLIEST_MS
}

function getNextExpectedEpisode(
  schedule: ShowSchedule,
  lastEpisodeNumber: number | null
): number | null {
  const next =
    lastEpisodeNumber === null ? schedule.startEpisode : lastEpisodeNumber + 1

  if (!isEpisodeInSchedule(schedule, next)) {
    return null
  }

  return next
}

/** The episode expected next and when it should drop. */
export interface NextDrop {
  episode: number
  /** Null when the schedule's start time is not a valid date. */
  expectedAt: Date | null
}

/**
 * The next drop after the last recorded episode (a stored or parsed episode
 * number; null or undefined before the first episode), or null once the
 * schedule has no more episodes. `airingSchedule` is the show's saved AniList
 * schedule, when it has one (see `getExpectedDropAt`).
 */
export function getNextDrop(
  schedule: ShowSchedule,
  lastEpisodeNumber: string | number | null | undefined,
  airingSchedule?: AiringSchedule | null
): NextDrop | null {
  const last =
    lastEpisodeNumber === null || lastEpisodeNumber === undefined
      ? null
      : parseEpisodeNumber(lastEpisodeNumber)
  const episode = getNextExpectedEpisode(schedule, last)
  if (episode === null) {
    return null
  }
  return {
    episode,
    expectedAt: getExpectedDropAt(schedule, episode, airingSchedule),
  }
}

/** From 5 minutes before the expected drop to 90 minutes after. */
function isInDropWindow(expectedAt: Date, now: Date): boolean {
  const nowMs = now.getTime()
  const expectedMs = expectedAt.getTime()
  return (
    nowMs >= expectedMs - DROP_WINDOW_BEFORE_MS &&
    nowMs <= expectedMs + DROP_WINDOW_AFTER_MS
  )
}

/** A 30-minute late slot after the drop window, matched to the 5-minute cron. */
function isInLateSlot(expectedAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - (expectedAt.getTime() + DROP_WINDOW_AFTER_MS)
  if (elapsed < 0) {
    return false
  }

  return (
    Math.floor(elapsed / LATE_SLOT_INTERVAL_MS) !==
    Math.floor((elapsed - CRON_INTERVAL_MS) / LATE_SLOT_INTERVAL_MS)
  )
}

export type DropWindowMode = 'drop_window' | 'late_slot'

/** Whether `now` is in the drop window or a late slot for this drop. */
export function getDropWindowMode(
  expectedAt: Date,
  now: Date = new Date()
): DropWindowMode | null {
  if (isInDropWindow(expectedAt, now)) {
    return 'drop_window'
  }
  if (isInLateSlot(expectedAt, now)) {
    return 'late_slot'
  }
  return null
}

export function isInDropWindowOrLateSlot(
  expectedAt: Date,
  now: Date = new Date()
): boolean {
  return getDropWindowMode(expectedAt, now) !== null
}

export function isPastWaitingGrace(
  expectedAt: Date,
  now: Date = new Date()
): boolean {
  return now.getTime() > expectedAt.getTime() + WAITING_GRACE_MS
}

/** Episode number from a stored or provider value; 0 when missing or not numeric. */
export function parseEpisodeNumber(
  value: string | number | null | undefined
): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function needsPlanToWatchCheck(
  state: StateFile,
  now: Date = new Date()
): boolean {
  const checkedAt = state.meta?.planToWatchCheckedAt
  if (!checkedAt) {
    return true
  }

  const checkedMs = new Date(checkedAt).getTime()
  if (Number.isNaN(checkedMs)) {
    return true
  }

  return now.getTime() - checkedMs >= PTW_CHECK_INTERVAL_MS
}

/** On hold shows checked for news of their return. */
export function getAwaitingReturn(state: StateFile): OnHoldSnapshotEntry[] {
  return (state.meta?.onHold?.entries ?? []).filter((entry) =>
    Boolean(entry.awaitingReturn)
  )
}

/** Daily, while any show is awaiting return. */
export function needsReturnCheck(
  state: StateFile,
  now: Date = new Date()
): boolean {
  if (getAwaitingReturn(state).length === 0) {
    return false
  }

  const checkedMs = Date.parse(state.meta?.returnCheckedAt ?? '')
  if (Number.isNaN(checkedMs)) {
    return true
  }

  return now.getTime() - checkedMs >= RETURN_CHECK_INTERVAL_MS
}

export function hasOrphanedShows(shows: Show[], state: StateFile): boolean {
  const activeIds = new Set(shows.map((show) => show.id))

  for (const showId of Object.keys(state.shows)) {
    if (!activeIds.has(showId)) {
      return true
    }
  }

  const messageIds = state.meta?.watchingDashboardMessageIds ?? {}
  for (const showId of Object.keys(messageIds)) {
    if (!activeIds.has(showId)) {
      return true
    }
  }

  return false
}

function getEasternDateKey(date: Date): { key: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date)
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return {
    key: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday'),
  }
}

/** Weekly on Sundays (Eastern), once per Sunday, to stay light on MAL. */
export function needsRelatedAnimeCheck(
  state: StateFile,
  now: Date = new Date()
): boolean {
  const today = getEasternDateKey(now)
  if (today.weekday !== 'Sun') {
    return false
  }

  const checkedAt = state.meta?.relatedAnimeCheckedAt
  if (!checkedAt) {
    return true
  }

  const checked = new Date(checkedAt)
  if (Number.isNaN(checked.getTime())) {
    return true
  }

  return getEasternDateKey(checked).key !== today.key
}
