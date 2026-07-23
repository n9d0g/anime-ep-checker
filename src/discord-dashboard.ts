import {
  buildShowDashboardPayload,
  buildShowDashboardRow,
} from './dashboard.js'
import {
  createBotMessage,
  deleteBotMessage,
  editBotMessage,
  pinBotMessage,
} from './discord-api.js'
import type { EpisodeSnapshot, Show, StateFile } from './types.js'
import { parseEpisodeNumber } from './schedule.js'
import { getShowState } from './compare.js'

export interface DiscordDashboardConfig {
  botToken?: string
  watchingChannelId?: string
}

function hasDashboardConfig(config: DiscordDashboardConfig): boolean {
  return Boolean(config.botToken?.trim() && config.watchingChannelId?.trim())
}

async function fetchProviderLatestEpisode(
  show: Show,
  fetchLatest: (show: Show) => Promise<EpisodeSnapshot | null>,
  inWindow: boolean
): Promise<number | null> {
  if (!inWindow) return null

  try {
    const snapshot = await fetchLatest(show)
    if (!snapshot?.episode.episode) return null
    return parseEpisodeNumber(String(snapshot.episode.episode))
  } catch {
    return null
  }
}

async function migrateLegacyDashboardMessage(
  botToken: string,
  channelId: string,
  state: StateFile
): Promise<boolean> {
  const legacyMessageId = state.meta?.watchingDashboardMessageId
  if (!legacyMessageId) {
    return false
  }

  await deleteBotMessage(botToken, channelId, legacyMessageId)
  state.meta = {
    ...state.meta,
    watchingDashboardMessageId: null,
  }
  return true
}

export async function syncWatchingDashboard({
  config,
  shows,
  state,
  now = new Date(),
  dryRun = false,
  fetchLatest,
  inWindowForShow,
}: {
  config: DiscordDashboardConfig
  shows: Show[]
  state: StateFile
  now?: Date
  dryRun?: boolean
  fetchLatest: (show: Show) => Promise<EpisodeSnapshot | null>
  inWindowForShow: (show: Show) => boolean
}): Promise<boolean> {
  if (!hasDashboardConfig(config)) {
    return false
  }

  if (dryRun) {
    console.log(`  Would refresh watching dashboard (${shows.length} shows)`)
    return false
  }

  const botToken = config.botToken!
  const channelId = config.watchingChannelId!
  let changed = false

  if (await migrateLegacyDashboardMessage(botToken, channelId, state)) {
    changed = true
    console.log('  Migrated legacy watching dashboard message')
  }

  const messageIds = {
    ...(state.meta?.watchingDashboardMessageIds ?? {}),
  }
  const activeShowIds = new Set(shows.map((show) => show.id))

  for (const [showId, messageId] of Object.entries(messageIds)) {
    if (!activeShowIds.has(showId)) {
      await deleteBotMessage(botToken, channelId, messageId)
      delete messageIds[showId]
      changed = true
      console.log(`  Removed watching dashboard message for ${showId}`)
    }
  }

  for (const show of shows) {
    const showState = getShowState(state, show.id)
    const providerLatest = await fetchProviderLatestEpisode(
      show,
      fetchLatest,
      inWindowForShow(show)
    )
    const row = await buildShowDashboardRow(
      show,
      showState,
      now,
      providerLatest
    )
    const payload = buildShowDashboardPayload(row)
    const existingMessageId = messageIds[show.id]

    if (existingMessageId) {
      try {
        await editBotMessage(botToken, channelId, existingMessageId, payload)
        console.log(`  Watching dashboard updated for ${show.title || show.id}`)
        continue
      } catch (error) {
        console.warn(
          `  Watching dashboard edit failed for ${show.id}; creating a new message: ${
            error instanceof Error ? error.message : error
          }`
        )
      }
    }

    const created = await createBotMessage(botToken, channelId, payload)
    messageIds[show.id] = created.id
    await pinBotMessage(botToken, channelId, created.id)
    changed = true
    console.log(`  Watching dashboard created for ${show.title || show.id}`)
  }

  state.meta = {
    ...state.meta,
    watchingDashboardMessageIds: messageIds,
  }

  return changed
}
