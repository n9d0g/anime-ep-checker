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
import type { ShowDashboardRow } from './dashboard.js'
import type { EpisodeSnapshot, Show, StateFile } from './types.js'
import { parseEpisodeNumber } from './schedule.js'
import { getShowState } from './compare.js'

// MAL mean scores drift by ±0.01 between runs; only re-render for bigger moves.
const MAL_SCORE_REFRESH_DELTA = 0.1

function hashDashboardRow(row: ShowDashboardRow): string {
  // Score is tracked separately so small drifts don't count as a change.
  const payload = buildShowDashboardPayload({ ...row, malScore: '' })
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex')
}

function hasMeaningfulScoreChange(
  previous: string | undefined,
  next: string
): boolean {
  if (previous === undefined || previous === next) return false

  const previousScore = Number.parseFloat(previous)
  const nextScore = Number.parseFloat(next)
  if (Number.isNaN(previousScore) || Number.isNaN(nextScore)) return true

  return Math.abs(nextScore - previousScore) >= MAL_SCORE_REFRESH_DELTA - 1e-9
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

  if (
    await migrateLegacyDashboardMessage(botToken, channelId, state, reasons)
  ) {
    changed = true
    console.log('  Migrated legacy watching dashboard message')
  }

  const messageIds = {
    ...(state.meta?.watchingDashboardMessageIds ?? {}),
  }
  const payloadHashes = {
    ...(state.meta?.watchingDashboardHashes ?? {}),
  }
  const shownScores = {
    ...(state.meta?.watchingDashboardScores ?? {}),
  }
  const activeShowIds = new Set(shows.map((show) => show.id))

  for (const [showId, messageId] of Object.entries(messageIds)) {
    if (!activeShowIds.has(showId)) {
      await deleteBotMessage(botToken, channelId, messageId)
      delete messageIds[showId]
      delete payloadHashes[showId]
      delete shownScores[showId]
      changed = true
      reasons.push(`removed watching dashboard message for ${showId}`)
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
    const payloadHash = hashDashboardRow(row)
    const existingMessageId = messageIds[show.id]
    let shouldCreate = !existingMessageId

    if (existingMessageId) {
      if (
        payloadHashes[show.id] === payloadHash &&
        !hasMeaningfulScoreChange(shownScores[show.id], row.malScore)
      ) {
        console.log(
          `  Watching dashboard unchanged for ${show.title || show.id}; skipping edit`
        )
        continue
      }

      try {
        await editBotMessage(botToken, channelId, existingMessageId, payload)
        payloadHashes[show.id] = payloadHash
        shownScores[show.id] = row.malScore
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
    shownScores[show.id] = row.malScore
    await pinBotMessage(botToken, channelId, created.id)
    changed = true
    reasons.push(`watching pin recreated for ${show.title || show.id}`)
    console.log(`  Watching dashboard created for ${show.title || show.id}`)
  }

  state.meta = {
    ...state.meta,
    watchingDashboardMessageIds: messageIds,
    watchingDashboardHashes: payloadHashes,
    watchingDashboardScores: shownScores,
  }

  return { changed, reasons }
}
