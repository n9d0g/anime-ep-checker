/**
 * Pure karma ranking scheduling: which week a Sunday alert covers and when
 * it is due. Used by both the Actions gate (`src/should-run.ts`) and the
 * checker (`src/karma-ranking.ts`), so it must stay free of npm dependencies.
 *
 * A karma ranking covers one Monday–Sunday week (Eastern) and goes out on
 * that Sunday from 20:00 Eastern, so Sunday's threads have had most of a day
 * to collect karma. Monday is a grace day for missed or failed runs.
 */

import type { StateFile } from './types.ts'
import { getEasternMidnight, getEasternParts } from './time-zone.ts'

/** Eastern hour on Sunday from which the week's ranking is due. */
export const KARMA_RANKING_SEND_HOUR = 20

/** Gate retry interval while the ranking is due but not yet sent. */
const KARMA_RANKING_POLL_INTERVAL_MS = 30 * 60 * 1000
const CRON_INTERVAL_MS = 5 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000

export interface KarmaRankingWeek {
  /** The week's Sunday as YYYY-MM-DD (Eastern); keys the week in state. */
  weekEnding: string
  /** Monday 00:00 Eastern. */
  start: Date
  /** The following Monday 00:00 Eastern (exclusive). */
  end: Date
}

function toDateKey(utcDay: Date): string {
  return utcDay.toISOString().slice(0, 10)
}

/** The Monday–Sunday week (Eastern) ending on the given Sunday (YYYY-MM-DD). */
export function getKarmaRankingWeek(weekEnding: string): KarmaRankingWeek {
  const [year, month, day] = weekEnding.split('-').map(Number)
  return {
    weekEnding,
    start: getEasternMidnight(year, month, day - 6),
    end: getEasternMidnight(year, month, day + 1),
  }
}

/**
 * The week whose ranking may go out now: from Sunday 20:00 Eastern through
 * the end of Monday, the week ending that Sunday; otherwise null.
 */
export function getDueKarmaRankingWeek(now: Date): KarmaRankingWeek | null {
  const p = getEasternParts(now.getTime())
  const today = new Date(Date.UTC(p.year, p.month - 1, p.day))
  const weekday = today.getUTCDay()

  let sunday: Date
  if (weekday === 0 && p.hour >= KARMA_RANKING_SEND_HOUR) {
    sunday = today
  } else if (weekday === 1) {
    sunday = new Date(today.getTime() - DAY_MS)
  } else {
    return null
  }

  return getKarmaRankingWeek(toDateKey(sunday))
}

/** The due week, unless its ranking was already sent. */
export function getPendingKarmaRankingWeek(
  state: StateFile,
  now: Date
): KarmaRankingWeek | null {
  const week = getDueKarmaRankingWeek(now)
  if (!week || state.meta?.karmaRanking?.weekEnding === week.weekEnding) {
    return null
  }
  return week
}

/**
 * True on the first cron tick of each 30-minute slot, so a failing fetch is
 * retried every half hour instead of on every 5-minute tick.
 */
export function isKarmaRankingPollSlot(now: Date): boolean {
  const ms = now.getTime()
  return (
    Math.floor(ms / KARMA_RANKING_POLL_INTERVAL_MS) !==
    Math.floor((ms - CRON_INTERVAL_MS) / KARMA_RANKING_POLL_INTERVAL_MS)
  )
}
