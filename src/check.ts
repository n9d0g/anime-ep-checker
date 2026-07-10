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
import { sendEpisodeAlert, sendWaitingAlert } from './discord.js'
import {
  getExpectedDropAt,
  getNextExpectedEpisode,
  isInCheckWindow,
  isPastWaitingGrace,
  parseEpisodeNumber,
} from './schedule.js'
import type { Show, ShowsFile, StateFile } from './types.js'

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

function resolveSeriesId(show: Show): string {
  if (show.seriesId) return show.seriesId
  return parseSeriesIdFromUrl(show.crunchyrollUrl)
}

export interface CheckOptions {
  showsPath?: string
  statePath?: string
  webhookUrl?: string
  dryRun?: boolean
  force?: boolean
}

export async function checkShows({
  showsPath = SHOWS_PATH,
  statePath = STATE_PATH,
  webhookUrl = process.env.DISCORD_WEBHOOK_URL,
  dryRun = false,
  force = false,
}: CheckOptions = {}): Promise<{ stateChanged: boolean; state: StateFile }> {
  const showsFile = await readJson<ShowsFile>(showsPath, { shows: [] })
  const state = await readJson<StateFile>(statePath, { shows: {} })
  const shows = showsFile.shows ?? []
  const now = new Date()
  let stateChanged = false

  for (const show of shows) {
    const showId = show.id
    const seriesId = resolveSeriesId(show)
    const previousState = getShowState(state, showId)
    const lastEpisodeNumber = previousState
      ? parseEpisodeNumber(previousState.lastEpisodeNumber)
      : null
    const nextExpectedEp = getNextExpectedEpisode(show.schedule, lastEpisodeNumber)

    console.log(`Checking ${show.title || showId} (${seriesId})...`)

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

    const latestSnapshot = await getLatestAvailableEpisodeForSeries(seriesId)
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
      const actualDropAt = latestSnapshot.episode.premium_available_date ?? null
      const timingStatus = getTimingStatus(expectedDropAt, actualDropAt)

      console.log(`  Episode ${nextExpectedEp} is available`)
      console.log(`  Timing: ${timingStatus}`)

      if (!dryRun && webhookUrl) {
        await sendEpisodeAlert({
          webhookUrl,
          show,
          latestSnapshot,
          episodeNumber: nextExpectedEp,
          timingStatus,
          expectedDropAt,
          actualDropAt,
        })
        console.log('  Discord alert sent')
      } else if (!webhookUrl) {
        console.log('  DISCORD_WEBHOOK_URL not set; skipping alert')
      }

      state.shows[showId] = createUpdatedState(
        latestSnapshot,
        nextExpectedEp
      )
      stateChanged = true
      continue
    }

    if (
      isPastWaitingGrace(expectedAt, now) &&
      previousState.waitingNotifiedForEpisode !== nextExpectedEp
    ) {
      console.log(`  Episode ${nextExpectedEp} is late; sending waiting alert`)

      if (!dryRun && webhookUrl) {
        await sendWaitingAlert({
          webhookUrl,
          show,
          episodeNumber: nextExpectedEp,
          expectedDropAt,
        })
        console.log('  Discord waiting alert sent')
      } else if (!webhookUrl) {
        console.log('  DISCORD_WEBHOOK_URL not set; skipping waiting alert')
      }

      state.shows[showId] = {
        ...previousState,
        waitingNotifiedForEpisode: nextExpectedEp,
      }
      stateChanged = true
      continue
    }

    console.log(
      `  Still waiting for episode ${nextExpectedEp} (latest on CR: ${latestEpisodeNumber})`
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
