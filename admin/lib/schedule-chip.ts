import {
  getBroadcastAt,
  getDropWindowMode,
  getExpectedDropAt,
  getNextDrop,
  isPastWaitingGrace,
} from '@shared/schedule'
import type { ShowSchedule } from '@shared/types'
import type { ShowStateSummary } from './types'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

export type ScheduleChipKind =
  | 'announced_break'
  | 'provider_lag'
  | 'still_waiting'
  | 'dropping_now'
  | 'break'

export interface ScheduleChip {
  kind: ScheduleChipKind
  label: string
}

/**
 * The one schedule state a Watching row shows, highest first: a pending
 * announced break, provider lag, still waiting, dropping now (in the drop
 * window), then a break that pushes the next drop back. Null when none apply.
 * The time-based states need the checker's live state: before the first
 * check there's no record of what has dropped.
 */
export function getScheduleChip(
  schedule: ShowSchedule,
  liveState: ShowStateSummary | undefined,
  now: Date = new Date()
): ScheduleChip | null {
  if (liveState?.announcedBreak?.status === 'pending') {
    return { kind: 'announced_break', label: 'Announced break' }
  }
  if (!liveState || !schedule.startAt) {
    return null
  }

  const nextDrop = getNextDrop(
    schedule,
    liveState.lastEpisodeNumber || null,
    liveState.airingSchedule
  )
  if (!nextDrop?.expectedAt) {
    return null
  }

  if (isPastWaitingGrace(nextDrop.expectedAt, now)) {
    const broadcastAt = getBroadcastAt(
      liveState.airingSchedule,
      nextDrop.episode
    )
    return broadcastAt && broadcastAt <= now
      ? { kind: 'provider_lag', label: 'Provider lag' }
      : { kind: 'still_waiting', label: 'Still waiting' }
  }

  if (getDropWindowMode(nextDrop.expectedAt, now) === 'drop_window') {
    return { kind: 'dropping_now', label: 'Dropping now' }
  }

  const previousDropAt = getExpectedDropAt(
    schedule,
    nextDrop.episode - 1,
    liveState.airingSchedule
  )
  if (previousDropAt) {
    const breakWeeks =
      Math.round(
        (nextDrop.expectedAt.getTime() - previousDropAt.getTime()) / MS_PER_WEEK
      ) - 1
    if (breakWeeks >= 1) {
      return { kind: 'break', label: `Break +${breakWeeks}w` }
    }
  }

  return null
}
