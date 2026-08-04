import { createHash } from 'node:crypto'
import {
  buildShowDashboardPayload,
  buildShowDashboardRow,
} from './dashboard.js'
import {
  createBotMessage,
  deleteBotMessage,
  DiscordApiError,
  editBotMessage,
  pinBotMessage,
  shouldRecreateWatchingMessageOnEditFailure,
} from './discord-api.js'
import type { EpisodeSnapshot, Show, StateFile } from './types.js'
import { parseEpisodeNumber } from './schedule.js'
import { getShowState } from './compare.js'

function hashDashboardPayload(payload: Record<string, unknown>): string {
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex')
}

export interface DiscordDashboardConfig {
  botToken?: string
  watchingChannelId?: string
}

export interface DashboardSyncResult {
  changed: boolean
  reasons: string[]
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
  state: StateFile,
  reasons: string[]
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
  reasons.push('removed legacy watching dashboard message')
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
}): Promise<DashboardSyncResult> {
  const reasons: string[] = []

  if (!hasDashboardConfig(config)) {
    return { changed: false, reasons }
  }

  if (dryRun) {
    console.log(`  Would refresh watching dashboard (${shows.length} shows)`)
    return { changed: false, reasons }
  }

  const botToken = config.botToken!
  const channelId = config.watchingChannelId!
  let changed = false

  if (await migrateLegacyDashboardMessage(botToken, channelId, state, reasons)) {
    changed = true
    console.log('  Migrated legacy watching dashboard message')
  }

  const messageIds = {
    ...(state.meta?.watchingDashboardMessageIds ?? {}),
  }
  const payloadHashes = {
    ...(state.meta?.watchingDashboardHashes ?? {}),
  }
  const activeShowIds = new Set(shows.map((show) => show.id))

  for (const [showId, messageId] of Object.entries(messageIds)) {
    if (!activeShowIds.has(showId)) {
      await deleteBotMessage(botToken, channelId, messageId)
      delete messageIds[showId]
      delete payloadHashes[showId]
      changed = true
      reasons.push(`removed watching dashboard message for ${showId}`)
      console.log(`  Removed watching dashboard message for ${showId}`)
    }
  }

  for (const show of shows) {
    const showState = getShowState(state, show.id)
    const prevDiscussionUrl = showState?.discussionUrl ?? null
    const prevDiscussionEpisode = showState?.discussionUrlEpisode ?? null
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

    if (
      showState &&
      (showState.discussionUrl !== prevDiscussionUrl ||
        showState.discussionUrlEpisode !== prevDiscussionEpisode)
    ) {
      changed = true
      reasons.push(`cached discussion URL for ${show.title || show.id}`)
    }

    const payload = buildShowDashboardPayload(row)
    const payloadHash = hashDashboardPayload(payload)
    const existingMessageId = messageIds[show.id]
    let shouldCreate = !existingMessageId

    if (existingMessageId) {
      if (payloadHashes[show.id] === payloadHash) {
        console.log(
          `  Watching dashboard unchanged for ${show.title || show.id}; skipping edit`
        )
        continue
      }

      try {
        await editBotMessage(botToken, channelId, existingMessageId, payload)
        payloadHashes[show.id] = payloadHash
        changed = true
        reasons.push(`watching dashboard updated for ${show.title || show.id}`)
        console.log(`  Watching dashboard updated for ${show.title || show.id}`)
        continue
      } catch (error) {
        const detail =
          error instanceof DiscordApiError
            ? `${error.status}: ${error.message}`
            : error instanceof Error
              ? error.message
              : String(error)

        if (shouldRecreateWatchingMessageOnEditFailure(error)) {
          console.warn(
            `  Watching dashboard edit failed for ${show.id}; recreating: ${detail}`
          )
          try {
            await deleteBotMessage(botToken, channelId, existingMessageId)
          } catch {
            // Message may already be gone (404).
          }
          shouldCreate = true
        } else {
          console.warn(
            `  Watching dashboard edit failed for ${show.id}; keeping existing pin: ${detail}`
          )
          continue
        }
      }
    }

    if (!shouldCreate) {
      continue
    }

    const created = await createBotMessage(botToken, channelId, payload)
    messageIds[show.id] = created.id
    payloadHashes[show.id] = payloadHash
    await pinBotMessage(botToken, channelId, created.id)
    changed = true
    reasons.push(`watching pin recreated for ${show.title || show.id}`)
    console.log(`  Watching dashboard created for ${show.title || show.id}`)
  }

  state.meta = {
    ...state.meta,
    watchingDashboardMessageIds: messageIds,
    watchingDashboardHashes: payloadHashes,
  }

  return { changed, reasons }
}
