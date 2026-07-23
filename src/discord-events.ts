import { formatEasternTime } from './time.js'
import {
  getShowWatchUrl,
  type Show,
  type ShowState,
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

async function updateScheduledEvent(
  botToken: string,
  guildId: string,
  eventId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const response = await discordBotRequest(
    botToken,
    `/guilds/${guildId}/scheduled-events/${eventId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Discord scheduled event update failed (${response.status}): ${body}`)
  }
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
  if (!eventId) return false

  await deleteScheduledEvent(config.botToken!, config.guildId!, eventId)
  showState.discordScheduledEventId = null
  showState.discordScheduledEventEpisode = null
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
    const showState = state.shows[show.id]
    const lastEpisodeNumber = showState
      ? parseEpisodeNumber(showState.lastEpisodeNumber)
      : null
    const nextEpisode = getNextExpectedEpisode(show.schedule, lastEpisodeNumber)
    const expectedAt =
      nextEpisode !== null
        ? getExpectedDropAt(show.schedule, nextEpisode)
        : null

    const existingEventId = showState?.discordScheduledEventId ?? null
    const existingEpisode = showState?.discordScheduledEventEpisode ?? null

    if (nextEpisode === null || !expectedAt) {
      if (existingEventId && showState) {
        if (!dryRun) {
          await deleteScheduledEvent(
            config.botToken!,
            config.guildId!,
            existingEventId
          )
        }
        showState.discordScheduledEventId = null
        showState.discordScheduledEventEpisode = null
        changed = true
        console.log(`  Discord event cleared for ${show.title || show.id}`)
      }
      continue
    }

    const payload = buildEventPayload(show, nextEpisode, expectedAt, now)

    if (existingEventId && existingEpisode === nextEpisode) {
      if (!dryRun) {
        await updateScheduledEvent(
          config.botToken!,
          config.guildId!,
          existingEventId,
          payload
        )
      }
      console.log(
        `  Discord event updated for ${show.title || show.id} ep ${nextEpisode}`
      )
      continue
    }

    if (existingEventId && showState) {
      if (!dryRun) {
        await deleteScheduledEvent(
          config.botToken!,
          config.guildId!,
          existingEventId
        )
      }
      showState.discordScheduledEventId = null
      showState.discordScheduledEventEpisode = null
      changed = true
    }

    if (!showState) {
      console.log(
        `  Skipping Discord event for ${show.title || show.id} (not baselined yet)`
      )
      continue
    }

    if (dryRun) {
      console.log(
        `  Would create Discord event for ${show.title || show.id} ep ${nextEpisode}`
      )
      continue
    }

    const eventId = await createScheduledEvent(
      config.botToken!,
      config.guildId!,
      payload
    )

    state.shows[show.id] = {
      ...showState,
      discordScheduledEventId: eventId,
      discordScheduledEventEpisode: nextEpisode,
    }
    changed = true
    console.log(
      `  Discord event created for ${show.title || show.id} ep ${nextEpisode}`
    )
  }

  return changed
}
