import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createBaselineState,
  createUpdatedState,
  getShowState,
  getTimingStatus,
} from './compare.js'
import {
  getLatestAvailableEpisodeForSeries,
  parseSeriesIdFromUrl,
} from './crunchyroll.js'
import {
  sendEpisodeAlert,
  sendNetflixCookieAlert,
  sendWaitingAlert,
  type DiscordConfig,
} from './discord.js'
import {
  getLatestAvailableEpisodeForTitle,
  NetflixAuthError,
  parseNetflixIdFromUrl,
} from './netflix.js'
import { findAnimeDiscussionUrl } from './reddit.js'
import {
  getExpectedDropAt,
  getNextExpectedEpisode,
  isInCheckWindow,
  isPastWaitingGrace,
  parseEpisodeNumber,
} from './schedule.js'
import {
  normalizeShowProvider,
  providerLabel,
  type EpisodeSnapshot,
  type Show,
  type ShowsFile,
  type StateFile,
} from './types.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHOWS_PATH = resolve(ROOT, 'shows.json')
const STATE_PATH = resolve(ROOT, 'state.json')

async function readJson<T>(path: string, fallback?: T): Promise<T> {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw) as T
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT' &&
      fallback !== undefined
    ) {
      return fallback
    }
    throw error
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function resolveProviderId(show: Show): string {
  const normalized = normalizeShowProvider(show)

  if (normalized.provider === 'netflix') {
    if (normalized.netflixId) return normalized.netflixId
    if (normalized.netflixUrl) return parseNetflixIdFromUrl(normalized.netflixUrl)
    throw new Error(`Netflix ID missing for show ${show.id}`)
  }

  if (normalized.seriesId) return normalized.seriesId
  if (normalized.crunchyrollUrl) {
    return parseSeriesIdFromUrl(normalized.crunchyrollUrl)
  }
  throw new Error(`Crunchyroll series ID missing for show ${show.id}`)
}

async function fetchLatestEpisode(show: Show): Promise<EpisodeSnapshot | null> {
  const normalized = normalizeShowProvider(show)
  const providerId = resolveProviderId(normalized)

  if (normalized.provider === 'netflix') {
    return getLatestAvailableEpisodeForTitle(providerId)
  }

  return getLatestAvailableEpisodeForSeries(providerId)
}

export interface CheckOptions {
  showsPath?: string
  statePath?: string
  discord?: DiscordConfig
  dryRun?: boolean
  force?: boolean
}

function hasDiscordConfig(discord: DiscordConfig): boolean {
  return Boolean(
    (discord.botToken?.trim() && discord.channelId?.trim()) ||
      discord.webhookUrl?.trim()
  )
}

function hasBotConfig(discord: DiscordConfig): boolean {
  return Boolean(discord.botToken?.trim() && discord.channelId?.trim())
}

function getDiscordConfigFromEnv(): DiscordConfig {
  return {
    botToken: process.env.DISCORD_BOT_TOKEN,
    channelId: process.env.DISCORD_CHANNEL_ID,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  }
}

export async function checkShows({
  showsPath = SHOWS_PATH,
  statePath = STATE_PATH,
  discord = getDiscordConfigFromEnv(),
  dryRun = false,
  force = false,
}: CheckOptions = {}): Promise<{ stateChanged: boolean; state: StateFile }> {
  const showsFile = await readJson<ShowsFile>(showsPath, { shows: [] })
  const state = await readJson<StateFile>(statePath, { shows: {} })
  const shows = (showsFile.shows ?? []).map(normalizeShowProvider)
  const now = new Date()
  let stateChanged = false
  let skipNetflixShows = false

  for (const show of shows) {
    const showId = show.id
    const providerId = resolveProviderId(show)
    const previousState = getShowState(state, showId)
    const lastEpisodeNumber = previousState
      ? parseEpisodeNumber(previousState.lastEpisodeNumber)
      : null
    const nextExpectedEp = getNextExpectedEpisode(show.schedule, lastEpisodeNumber)

    console.log(
      `Checking ${show.title || showId} (${providerLabel(show.provider)} ${providerId})...`
    )

    if (show.provider === 'netflix' && skipNetflixShows) {
      console.log('  Skipping Netflix show (cookie auth failed earlier this run)')
      continue
    }

    if (nextExpectedEp === null) {
      console.log('  No more scheduled episodes for this show')
      continue
    }

    const expectedAt = getExpectedDropAt(show.schedule, nextExpectedEp)
    if (!expectedAt) {
      console.log(`  Could not compute expected drop for episode ${nextExpectedEp}`)
      continue
    }

    if (!force && !isInCheckWindow(expectedAt, now)) {
      console.log(
        `  Outside check window for ep ${nextExpectedEp} (expected ${expectedAt.toISOString()})`
      )
      continue
    }

    let latestSnapshot: EpisodeSnapshot | null
    try {
      latestSnapshot = await fetchLatestEpisode(show)
    } catch (error) {
      if (error instanceof NetflixAuthError) {
        console.error(`  Netflix auth failed: ${error.message}`)
        skipNetflixShows = true

        if (!state.meta?.netflixCookieAlertSentAt) {
          if (!dryRun && hasBotConfig(discord)) {
            await sendNetflixCookieAlert(discord)
            console.log('  Netflix cookie refresh alert sent via Discord bot')
          } else if (!dryRun) {
            console.log(
              '  Discord bot not configured; skipping Netflix cookie refresh alert'
            )
          }

          state.meta = {
            ...state.meta,
            netflixCookieAlertSentAt: now.toISOString(),
          }
          stateChanged = true
        } else {
          console.log('  Netflix cookie refresh alert already sent; skipping')
        }

        continue
      }

      throw error
    }

    if (show.provider === 'netflix' && state.meta?.netflixCookieAlertSentAt) {
      state.meta = {
        ...state.meta,
        netflixCookieAlertSentAt: null,
      }
      stateChanged = true
    }

    if (!latestSnapshot) {
      console.log(`  No available episodes found for ${showId}`)
      continue
    }

    if (!previousState) {
      state.shows[showId] = createBaselineState(latestSnapshot)
      stateChanged = true
      console.log(
        `  Baseline set to episode ${latestSnapshot.episode.episode} (${latestSnapshot.episode.id})`
      )
      continue
    }

    const latestEpisodeNumber = parseEpisodeNumber(
      String(latestSnapshot.episode.episode ?? '')
    )
    const expectedDropAt = expectedAt.toISOString()

    if (latestEpisodeNumber >= nextExpectedEp) {
      const actualDropAt = latestSnapshot.episode.availableAt ?? null
      const timingStatus = getTimingStatus(expectedDropAt, actualDropAt)

      console.log(`  Episode ${nextExpectedEp} is available`)
      console.log(`  Timing: ${timingStatus}`)

      if (!dryRun) {
        if (hasDiscordConfig(discord)) {
          const discussionUrl = await findAnimeDiscussionUrl(
            show.title || show.id,
            nextExpectedEp,
            show.redditSearchTitle
          )

          if (discussionUrl) {
            console.log(`  Reddit discussion: ${discussionUrl}`)
          }

          await sendEpisodeAlert({
            discord,
            show,
            latestSnapshot,
            episodeNumber: nextExpectedEp,
            timingStatus,
            expectedDropAt,
            actualDropAt,
            discussionUrl,
          })
          console.log('  Discord alert sent')
        } else {
          console.log('  Discord not configured; skipping alert')
        }
      }

      state.shows[showId] = createUpdatedState(latestSnapshot, nextExpectedEp)
      stateChanged = true
      continue
    }

    if (
      isPastWaitingGrace(expectedAt, now) &&
      previousState.waitingNotifiedForEpisode !== nextExpectedEp
    ) {
      console.log(`  Episode ${nextExpectedEp} is late; sending waiting alert`)

      if (!dryRun) {
        if (hasDiscordConfig(discord)) {
          await sendWaitingAlert({
            discord,
            show,
            episodeNumber: nextExpectedEp,
            expectedDropAt,
          })
          console.log('  Discord waiting alert sent')
        } else {
          console.log('  Discord not configured; skipping waiting alert')
        }
      }

      state.shows[showId] = {
        ...previousState,
        waitingNotifiedForEpisode: nextExpectedEp,
      }
      stateChanged = true
      continue
    }

    console.log(
      `  Still waiting for episode ${nextExpectedEp} (latest on ${providerLabel(show.provider)}: ${latestEpisodeNumber})`
    )
  }

  if (stateChanged && !dryRun) {
    await writeJson(statePath, state)
  }

  return { stateChanged, state }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')

  checkShows({ dryRun, force })
    .then(({ stateChanged }) => {
      if (dryRun) {
        console.log(
          stateChanged
            ? 'Dry run complete (state would be updated).'
            : 'Dry run complete (no changes).'
        )
        return
      }
      console.log(stateChanged ? 'State updated.' : 'No state changes.')
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
