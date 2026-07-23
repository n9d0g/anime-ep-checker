import {
  buildDashboardEmbeds,
  buildShowDashboardRow,
  type ShowDashboardRow,
} from './dashboard.js'
import {
  createBotMessage,
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

  const rows: ShowDashboardRow[] = []

  for (const show of shows) {
    const showState = getShowState(state, show.id)
    const providerLatest = await fetchProviderLatestEpisode(
      show,
      fetchLatest,
      inWindowForShow(show)
    )
    rows.push(await buildShowDashboardRow(show, showState, now, providerLatest))
  }

  const embeds = buildDashboardEmbeds(rows)
  const payload = {
    content: '**Watching dashboard** — tracked shows, MAL progress, and next drops.',
    embeds: embeds.slice(0, 10),
  }

  if (dryRun) {
    console.log(`  Would refresh watching dashboard (${rows.length} shows)`)
    return false
  }

  const botToken = config.botToken!
  const channelId = config.watchingChannelId!
  const existingMessageId = state.meta?.watchingDashboardMessageId ?? null

  if (existingMessageId) {
    try {
      await editBotMessage(botToken, channelId, existingMessageId, payload)
      console.log('  Watching dashboard updated')
      return false
    } catch (error) {
      console.warn(
        `  Watching dashboard edit failed; creating a new message: ${
          error instanceof Error ? error.message : error
        }`
      )
    }
  }

  const created = await createBotMessage(botToken, channelId, payload)
  state.meta = {
    ...state.meta,
    watchingDashboardMessageId: created.id,
  }
  await pinBotMessage(botToken, channelId, created.id)
  console.log('  Watching dashboard created')
  return true
}
