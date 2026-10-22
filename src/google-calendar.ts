// Google Calendar sync: keeps one event per upcoming drop for each show.
// The API client lives in google-calendar-api.ts and the pure diff in
// calendar-plan.ts; this module gathers what exists, applies the plan and
// records the result in state.
import { formatEasternTime } from './time.ts'
import { getShowWatchUrl } from '../shared/shows.ts'
import type { Show, ShowState, StateFile } from '../shared/types.ts'
import { parseEpisodeNumber } from '../shared/schedule.ts'
import { getSeasonEpisodes, getSeasons } from './crunchyroll.ts'
import { parseSeriesIdFromUrl } from '../shared/provider-urls.ts'
import {
  createCalendarEvent,
  deleteCalendarEvent,
  hasCalendarConfig,
  listCalendarEventsForShow,
  updateCalendarEvent,
} from './google-calendar-api.ts'
import type {
  CalendarEventDetails,
  GoogleCalendarConfig,
  ListedCalendarEvent,
} from './google-calendar-api.ts'
import { getDesiredCalendarEvents, planCalendarSync } from './calendar-plan.ts'
import type { CalendarPlan, ExistingCalendarEvent } from './calendar-plan.ts'

export type { GoogleCalendarConfig } from './google-calendar-api.ts'

const EVENT_DURATION_MS = 30 * 60 * 1000

type StoredCalendarEvents = NonNullable<ShowState['googleCalendarEvents']>

type LookupEpisodeTitle = (episodeNumber: number) => Promise<string | null>

function buildEventTitle(
  show: Show,
  episodeNumber: number,
  episodeTitle: string | null
): string {
  const showTitle = show.title || show.id
  const base = `${showTitle} — Episode ${episodeNumber}`
  const trimmedTitle = episodeTitle?.trim()
  return trimmedTitle ? `${base}: ${trimmedTitle}` : base
}

function buildEventDetails(
  show: Show,
  episodeNumber: number,
  expectedDropAt: Date,
  episodeTitle: string | null
): CalendarEventDetails {
  const watchUrl = getShowWatchUrl(show)
  const eastern = formatEasternTime(expectedDropAt.toISOString())

  const descriptionParts = [
    `Expected around ${eastern}.`,
    episodeTitle?.trim() ? `Episode: ${episodeTitle.trim()}` : null,
    watchUrl ? `Watch: ${watchUrl}` : null,
  ].filter(Boolean)

  return {
    showId: show.id,
    episode: episodeNumber,
    summary: buildEventTitle(show, episodeNumber, episodeTitle),
    description: descriptionParts.join('\n'),
    location: watchUrl || null,
    startAt: expectedDropAt,
    endAt: new Date(expectedDropAt.getTime() + EVENT_DURATION_MS),
  }
}

async function lookupCrunchyrollEpisodeTitle(
  show: Show,
  showState: ShowState,
  episodeNumber: number
): Promise<string | null> {
  if (show.provider !== 'crunchyroll') {
    return null
  }

  try {
    const seriesId =
      show.seriesId ||
      (show.crunchyrollUrl ? parseSeriesIdFromUrl(show.crunchyrollUrl) : null)
    if (!seriesId) {
      return null
    }

    const seasons = await getSeasons(seriesId)
    const season =
      seasons.find((entry) => entry.id === showState.seasonId) ??
      seasons[seasons.length - 1]
    if (!season) {
      return null
    }

    const episodes = await getSeasonEpisodes(season.id)
    const providerEpisode = episodeNumber + (showState.episodeOffset ?? 0)
    const match = episodes.find(
      (episode) => Number(episode.episode) === providerEpisode
    )
    return match?.title?.trim() || null
  } catch {
    return null
  }
}

/**
 * Events known for a show, in the planner's priority order: stored events
 * first, then listed ones (the last listed event per episode; untagged
 * events are ignored).
 */
function getExistingCalendarEvents(
  stored: StoredCalendarEvents,
  listed: ListedCalendarEvent[]
): ExistingCalendarEvent[] {
  const listedByEpisode = new Map<string, ExistingCalendarEvent>()
  for (const event of listed) {
    if (event.episode) {
      listedByEpisode.set(event.episode, {
        episode: event.episode,
        eventId: event.eventId,
        startAt: event.startAt,
      })
    }
  }

  return [
    ...Object.entries(stored).map(([episode, entry]) => ({
      episode,
      eventId: entry.eventId,
      startAt: entry.startAt,
    })),
    ...listedByEpisode.values(),
  ]
}

/**
 * Applies a plan: deletes first, then creates and updates. Episode titles are
 * only looked up for events that are written. Returns whether anything
 * changed (or would, on a dry run) and the show's events afterwards.
 */
async function applyCalendarPlan({
  config,
  show,
  plan,
  dryRun,
  lookupEpisodeTitle,
}: {
  config: GoogleCalendarConfig
  show: Show
  plan: CalendarPlan
  dryRun: boolean
  lookupEpisodeTitle: LookupEpisodeTitle
}): Promise<{ changed: boolean; events: StoredCalendarEvents }> {
  const showTitle = show.title || show.id
  let changed = false

  for (const eventId of plan.deletes) {
    if (dryRun) {
      console.log(
        `  Would delete Google Calendar event ${eventId} for ${showTitle}`
      )
      changed = true
      continue
    }
    await deleteCalendarEvent(config, eventId)
    changed = true
    console.log(`  Google Calendar event deleted for ${showTitle}`)
  }

  const events: StoredCalendarEvents = {}
  for (const kept of plan.unchanged) {
    events[String(kept.episode)] = {
      eventId: kept.eventId,
      startAt: kept.startAt,
    }
  }

  for (const write of plan.writes) {
    changed = true
    if (dryRun) {
      console.log(
        `  Would ${write.action} Google Calendar event for ${showTitle} ep ${write.episode}`
      )
      continue
    }

    const details = buildEventDetails(
      show,
      write.episode,
      new Date(write.startAt),
      await lookupEpisodeTitle(write.episode)
    )
    let eventId: string
    if (write.action === 'update') {
      await updateCalendarEvent(config, write.eventId, details)
      eventId = write.eventId
    } else {
      eventId = await createCalendarEvent(config, details)
    }
    events[String(write.episode)] = { eventId, startAt: write.startAt }
    console.log(
      `  Google Calendar event ${write.action}d for ${showTitle} ep ${write.episode}`
    )
  }

  return { changed, events }
}

export async function clearGoogleCalendarEventForEpisode(
  config: GoogleCalendarConfig,
  showId: string,
  episodeNumber: number,
  state: StateFile
): Promise<boolean> {
  if (!hasCalendarConfig(config)) {
    return false
  }

  const showState = state.shows[showId]
  if (!showState) {
    return false
  }

  const key = String(episodeNumber)
  const storedId = showState.googleCalendarEvents?.[key]?.eventId
  if (storedId) {
    await deleteCalendarEvent(config, storedId)
    delete showState.googleCalendarEvents![key]
    if (Object.keys(showState.googleCalendarEvents!).length === 0) {
      showState.googleCalendarEvents = null
    }
    return true
  }

  const listed = await listCalendarEventsForShow(config, showId)
  const match = listed.find((event) => event.episode === key)
  if (!match) {
    return false
  }

  await deleteCalendarEvent(config, match.eventId)
  return true
}

export async function clearGoogleCalendarEventsForShow(
  config: GoogleCalendarConfig,
  showId: string,
  state: StateFile,
  dryRun = false
): Promise<boolean> {
  if (!hasCalendarConfig(config)) {
    return false
  }

  const showState = state.shows[showId]
  const deleteIds = new Set<string>()

  if (showState?.googleCalendarEvents) {
    for (const entry of Object.values(showState.googleCalendarEvents)) {
      deleteIds.add(entry.eventId)
    }
  }

  if (!dryRun) {
    const listed = await listCalendarEventsForShow(config, showId)
    for (const event of listed) {
      deleteIds.add(event.eventId)
    }
  }

  if (deleteIds.size === 0 && !showState?.googleCalendarEvents) {
    return false
  }

  let changed = false
  for (const eventId of deleteIds) {
    if (dryRun) {
      console.log(
        `  Would delete Google Calendar event ${eventId} for ${showId}`
      )
      changed = true
      continue
    }
    await deleteCalendarEvent(config, eventId)
    changed = true
    console.log(`  Google Calendar event deleted for ${showId}`)
  }

  if (showState) {
    showState.googleCalendarEvents = null
    changed = true
  }

  return changed
}

/**
 * Syncs one show. Before the baseline the show has no state: listed events
 * are still synced (without episode titles) but nothing is stored and the
 * sync never reports a state change.
 */
async function syncCalendarEventsForShow({
  config,
  show,
  state,
  now,
  dryRun,
}: {
  config: GoogleCalendarConfig
  show: Show
  state: StateFile
  now: Date
  dryRun: boolean
}): Promise<boolean> {
  const showState = state.shows[show.id]
  const lastEpisodeNumber = showState
    ? parseEpisodeNumber(showState.lastEpisodeNumber)
    : null
  const desired = getDesiredCalendarEvents(
    show.schedule,
    lastEpisodeNumber,
    now
  )

  const listed = dryRun ? [] : await listCalendarEventsForShow(config, show.id)
  const existing = getExistingCalendarEvents(
    showState?.googleCalendarEvents ?? {},
    listed
  )

  const { changed, events } = await applyCalendarPlan({
    config,
    show,
    plan: planCalendarSync(desired, existing),
    dryRun,
    lookupEpisodeTitle: showState
      ? (episode) => lookupCrunchyrollEpisodeTitle(show, showState, episode)
      : async () => null,
  })

  if (!showState) {
    return false
  }
  if (!dryRun) {
    showState.googleCalendarEvents =
      Object.keys(events).length > 0 ? events : null
  }
  return changed
}

export async function syncGoogleCalendarEvents({
  config,
  shows,
  state,
  now = new Date(),
  dryRun = false,
}: {
  config: GoogleCalendarConfig
  shows: Show[]
  state: StateFile
  now?: Date
  dryRun?: boolean
}): Promise<boolean> {
  if (!hasCalendarConfig(config)) {
    return false
  }

  let changed = false
  for (const show of shows) {
    try {
      const showChanged = await syncCalendarEventsForShow({
        config,
        show,
        state,
        now,
        dryRun,
      })
      if (showChanged) {
        changed = true
      }
    } catch (error) {
      console.warn(
        `Google Calendar sync failed for ${show.title || show.id}: ${
          error instanceof Error ? error.message : error
        }`
      )
    }
  }

  return changed
}

export function getGoogleCalendarConfigFromEnv(): GoogleCalendarConfig {
  return {
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    calendarId: process.env.GOOGLE_CALENDAR_ID,
  }
}
