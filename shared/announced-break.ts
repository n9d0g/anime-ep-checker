// When to read a show's official news for an announced break. Pure, and free
// of npm dependencies, so the Actions gate can import it (ADR 0002).
import { getNextDrop, isPastWaitingGrace } from './schedule.ts'
import type { Show, ShowState } from './types.ts'

const MS_PER_MINUTE = 60 * 1000
const MS_PER_HOUR = 60 * MS_PER_MINUTE
const MS_PER_DAY = 24 * MS_PER_HOUR

/** After an episode drops: checks for the next one, every 6 hours for a day. */
const AFTER_DROP_MS = MS_PER_DAY
const AFTER_DROP_INTERVAL_MS = 6 * MS_PER_HOUR
/** How long before a next drop the daily checks start. */
const BEFORE_DROP_MS = 3 * MS_PER_DAY
/** About once a day (a little under, so a daily run never just misses it). */
const DAILY_INTERVAL_MS = 23 * MS_PER_HOUR
/** Once still waiting has fired: the late-slot cadence. */
const LATE_INTERVAL_MS = 30 * MS_PER_MINUTE
/** A drop this late (likely a TBA break) goes back to daily checks. */
const LATE_DAILY_AFTER_MS = MS_PER_DAY

/**
 * Whether the show's official news is due a read: at each drop and every 6
 * hours for a day after it (a break is often announced the day the episode
 * broadcasts), once a day in the 3 days before the next drop, and every 30
 * minutes once that drop is past still waiting (daily again after a day, so
 * a long break doesn't burn requests).
 */
export function isAnnouncementCheckDue(
  show: Show,
  showState: ShowState | null | undefined,
  now: Date
): boolean {
  if (!showState) {
    return false
  }
  const nextDrop = getNextDrop(
    show.schedule,
    showState.lastEpisodeNumber,
    showState.airingSchedule
  )
  if (!nextDrop?.expectedAt) {
    return false
  }

  const checkedMs = showState.announcementCheckedAt
    ? Date.parse(showState.announcementCheckedAt)
    : Number.NaN
  const sinceChecked = Number.isNaN(checkedMs)
    ? Number.POSITIVE_INFINITY
    : now.getTime() - checkedMs
  const untilDrop = nextDrop.expectedAt.getTime() - now.getTime()

  // Measured from the episode alert, so a late drop still gets its day.
  const droppedMs = Date.parse(showState.lastNotifiedAt)
  const sinceDropped = now.getTime() - droppedMs
  if (sinceDropped >= 0 && sinceDropped < AFTER_DROP_MS) {
    // A check before the drop (e.g. a late-slot one) was about this episode.
    if (Number.isNaN(checkedMs) || checkedMs < droppedMs) return true
    if (sinceChecked >= AFTER_DROP_INTERVAL_MS) return true
  }

  if (isPastWaitingGrace(nextDrop.expectedAt, now)) {
    const interval =
      -untilDrop >= LATE_DAILY_AFTER_MS ? DAILY_INTERVAL_MS : LATE_INTERVAL_MS
    return sinceChecked >= interval
  }
  if (untilDrop <= BEFORE_DROP_MS) {
    return sinceChecked >= DAILY_INTERVAL_MS
  }
  return false
}
