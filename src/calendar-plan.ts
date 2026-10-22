// Pure Google Calendar sync planning: which events to create, update and
// delete so a show's calendar holds one event per upcoming drop.
import {
  getExpectedDropAt,
  getLastScheduledEpisode,
  getNextDrop,
  isEpisodeInSchedule,
} from '../shared/schedule.ts'
import type { ShowSchedule } from '../shared/types.ts'

/** An event the calendar should hold: one upcoming drop. */
export interface DesiredCalendarEvent {
  episode: number
  /** The expected drop time as an ISO string. */
  startAt: string
}

/** An event already known for the show, from state or the calendar. */
export interface ExistingCalendarEvent {
  episode: string
  eventId: string
  startAt: string | null
}

export type CalendarEventWrite =
  | { action: 'create'; episode: number; startAt: string }
  | { action: 'update'; episode: number; startAt: string; eventId: string }

export interface KeptCalendarEvent {
  episode: number
  startAt: string
  eventId: string
}

export interface CalendarPlan {
  /** Ids of events for episodes that no longer have an upcoming drop. */
  deletes: string[]
  /** Creates and updates, in desired (episode) order. */
  writes: CalendarEventWrite[]
  /** Desired events that already exist at the right time. */
  unchanged: KeptCalendarEvent[]
}

/**
 * The upcoming drops a show's calendar should hold: the next drop for an
 * ongoing show, or every remaining scheduled episode for a finite one,
 * skipping any whose expected drop is not after `now`.
 */
export function getDesiredCalendarEvents(
  schedule: ShowSchedule,
  lastEpisodeNumber: number | null,
  now: Date
): DesiredCalendarEvent[] {
  const nextDrop = getNextDrop(schedule, lastEpisodeNumber)
  if (nextDrop === null) {
    return []
  }

  const episodeNumbers: number[] = []
  if (schedule.mode === 'ongoing') {
    episodeNumbers.push(nextDrop.episode)
  } else {
    const lastScheduled = getLastScheduledEpisode(schedule)
    if (lastScheduled === null) {
      return []
    }
    for (let episode = nextDrop.episode; episode <= lastScheduled; episode++) {
      if (isEpisodeInSchedule(schedule, episode)) {
        episodeNumbers.push(episode)
      }
    }
  }

  const desired: DesiredCalendarEvent[] = []
  for (const episode of episodeNumbers) {
    const expectedDropAt = getExpectedDropAt(schedule, episode)
    if (!expectedDropAt || expectedDropAt.getTime() <= now.getTime()) {
      continue
    }
    desired.push({ episode, startAt: expectedDropAt.toISOString() })
  }
  return desired
}

/**
 * Plans the writes that turn `existing` into `desired`. `existing` is in
 * priority order: when several events share an episode, the first one is
 * kept or updated. Every existing event for an episode that is not desired
 * is deleted. An event is only rewritten when its start time differs.
 */
export function planCalendarSync(
  desired: DesiredCalendarEvent[],
  existing: ExistingCalendarEvent[]
): CalendarPlan {
  const desiredEpisodes = new Set(desired.map((entry) => String(entry.episode)))

  const deletes = new Set<string>()
  const existingByEpisode = new Map<string, ExistingCalendarEvent>()
  for (const event of existing) {
    if (!desiredEpisodes.has(event.episode)) {
      deletes.add(event.eventId)
    } else if (!existingByEpisode.has(event.episode)) {
      existingByEpisode.set(event.episode, event)
    }
  }

  const writes: CalendarEventWrite[] = []
  const unchanged: KeptCalendarEvent[] = []
  for (const { episode, startAt } of desired) {
    const current = existingByEpisode.get(String(episode))
    if (!current) {
      writes.push({ action: 'create', episode, startAt })
    } else if (current.startAt === startAt) {
      unchanged.push({ episode, startAt, eventId: current.eventId })
    } else {
      writes.push({
        action: 'update',
        episode,
        startAt,
        eventId: current.eventId,
      })
    }
  }

  return { deletes: [...deletes], writes, unchanged }
}
