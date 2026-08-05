import { formatEasternTime } from './time.js'
import {
  getShowWatchUrl,
  type Show,
  type StateFile,
} from './types.js'
import {
  getExpectedDropAt,
  getNextExpectedEpisode,
  parseEpisodeNumber,
} from './schedule.js'
import { discordBotRequest } from './discord-api.js'

export interface DiscordEventsConfig {
  botToken?: string
  guildId?: string
}

const EVENT_DURATION_MS = 60 * 60 * 1000
const SCHEDULED_EVENT_EXTERNAL = 3
const PRIVACY_GUILD_ONLY = 2

interface ScheduledEventResponse {
  id: string
}

function hasEventsConfig(config: DiscordEventsConfig): boolean {
  return Boolean(config.botToken?.trim() && config.guildId?.trim())
}

function futureStartTime(expectedAt: Date, now: Date): Date {
  const minimum = new Date(now.getTime() + 2 * 60 * 1000)
  return expectedAt.getTime() > minimum.getTime() ? expectedAt : minimum
}

async function createScheduledEvent(
  botToken: string,
  guildId: string,
  payload: Record<string, unknown>
): Promise<string> {
  const response = await discordBotRequest(
    botToken,
    `/guilds/${guildId}/scheduled-events`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Discord scheduled event create failed (${response.status}): ${body}`)
  }

  const data = (await response.json()) as ScheduledEventResponse
  return data.id
}

async function deleteScheduledEvent(
  botToken: string,
  guildId: string,
  eventId: string
): Promise<void> {
  const response = await discordBotRequest(
    botToken,
    `/guilds/${guildId}/scheduled-events/${eventId}`,
    { method: 'DELETE' }
  )

  if (!response.ok && response.status !== 404) {
    const body = await response.text()
    throw new Error(`Discord scheduled event delete failed (${response.status}): ${body}`)
  }
}

function buildEventPayload(
  show: Show,
  episodeNumber: number,
  expectedAt: Date,
  now: Date
): Record<string, unknown> {
  const start = futureStartTime(expectedAt, now)
  const end = new Date(start.getTime() + EVENT_DURATION_MS)
  const watchUrl = getShowWatchUrl(show)
  const showTitle = show.title || show.id

  return {
    name: `${showTitle} — Episode ${episodeNumber}`,
    description: `Expected around ${formatEasternTime(expectedAt.toISOString())}.`,
    privacy_level: PRIVACY_GUILD_ONLY,
    scheduled_start_time: start.toISOString(),
    scheduled_end_time: end.toISOString(),
    entity_type: SCHEDULED_EVENT_EXTERNAL,
    entity_metadata: {
      location: watchUrl || 'Streaming',
    },
  }
}

export async function clearScheduledEventForShow(
  config: DiscordEventsConfig,
  showId: string,
  state: StateFile
): Promise<boolean> {
  if (!hasEventsConfig(config)) return false

  const showState = state.shows[showId]
  const eventId = showState?.discordScheduledEventId
  if (!eventId || !showState) return false

  await deleteScheduledEvent(config.botToken!, config.guildId!, eventId)
  showState.discordScheduledEventId = null
  showState.discordScheduledEventEpisode = null
  return true
}

async function clearStoredScheduledEvent(
  botToken: string,
  guildId: string,
  showState: NonNullable<StateFile['shows'][string]>,
  showTitle: string,
  dryRun: boolean
): Promise<boolean> {
  const existingEventId = showState.discordScheduledEventId
  if (!existingEventId) {
    return false
  }

  if (!dryRun) {
    await deleteScheduledEvent(botToken, guildId, existingEventId)
    showState.discordScheduledEventId = null
    showState.discordScheduledEventEpisode = null
    console.log(`  Discord event cleared for ${showTitle}`)
    return true
  }

  return false
}

async function syncScheduledEventForShow({
  config,
  show,
  state,
  now,
  dryRun,
}: {
  config: DiscordEventsConfig
  show: Show
  state: StateFile
  now: Date
  dryRun: boolean
}): Promise<boolean> {
  const botToken = config.botToken!
  const guildId = config.guildId!
  const showTitle = show.title || show.id
  const showState = state.shows[show.id]
  const lastEpisodeNumber = showState
    ? parseEpisodeNumber(showState.lastEpisodeNumber)
    : null
  const nextEpisode = getNextExpectedEpisode(show.schedule, lastEpisodeNumber)
  const expectedAt =
    nextEpisode !== null ? getExpectedDropAt(show.schedule, nextEpisode) : null

  if (nextEpisode === null || !expectedAt) {
    if (!showState) {
      return false
    }
    return clearStoredScheduledEvent(botToken, guildId, showState, showTitle, dryRun)
  }

  if (expectedAt.getTime() <= now.getTime()) {
    if (!showState) {
      return false
    }
    return clearStoredScheduledEvent(botToken, guildId, showState, showTitle, dryRun)
  }

  if (!showState) {
    console.log(`  Skipping Discord event for ${showTitle} (not baselined yet)`)
    return false
  }

  const payload = buildEventPayload(show, nextEpisode, expectedAt, now)
  const existingEventId = showState.discordScheduledEventId ?? null
  const existingEpisode = showState.discordScheduledEventEpisode ?? null

  if (dryRun) {
    if (existingEventId && existingEpisode === nextEpisode) {
      console.log(
        `  Would leave Discord event unchanged for ${showTitle} ep ${nextEpisode}`
      )
    } else {
      console.log(`  Would create Discord event for ${showTitle} ep ${nextEpisode}`)
    }
    return false
  }

  if (existingEventId && existingEpisode === nextEpisode) {
    console.log(
      `  Discord event unchanged for ${showTitle} ep ${nextEpisode}; skipping sync`
    )
    return false
  } else if (existingEventId) {
    await clearStoredScheduledEvent(botToken, guildId, showState, showTitle, false)
  }

  const eventId = await createScheduledEvent(botToken, guildId, payload)
  state.shows[show.id] = {
    ...showState,
    discordScheduledEventId: eventId,
    discordScheduledEventEpisode: nextEpisode,
  }
  console.log(`  Discord event created for ${showTitle} ep ${nextEpisode}`)
  return true
}

export async function syncScheduledEvents({
  config,
  shows,
  state,
  now = new Date(),
  dryRun = false,
}: {
  config: DiscordEventsConfig
  shows: Show[]
  state: StateFile
  now?: Date
  dryRun?: boolean
}): Promise<boolean> {
  if (!hasEventsConfig(config)) {
    return false
  }

  let changed = false

  for (const show of shows) {
    try {
      const showChanged = await syncScheduledEventForShow({
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
        `Discord scheduled event sync failed for ${show.title || show.id}: ${
          error instanceof Error ? error.message : error
        }`
      )
    }
  }

  return changed
}
