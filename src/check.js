import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  getLatestAvailableEpisodeForSeries,
  parseSeriesIdFromUrl,
} from './crunchyroll.js'
import {
  createBaselineState,
  createUpdatedState,
  getShowState,
  getTimingStatus,
  isNewEpisode,
} from './compare.js'
import { sendEpisodeAlert } from './discord.js'

const ROOT = resolve(import.meta.dirname, '..')
const SHOWS_PATH = resolve(ROOT, 'shows.json')
const STATE_PATH = resolve(ROOT, 'state.json')

async function readJson(path, fallback) {
  try {
    const raw = await readFile(path, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) {
      return fallback
    }
    throw error
  }
}

async function writeJson(path, data) {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function resolveSeriesId(show) {
  if (show.seriesId) return show.seriesId
  return parseSeriesIdFromUrl(show.crunchyrollUrl)
}

export async function checkShows({
  showsPath = SHOWS_PATH,
  statePath = STATE_PATH,
  webhookUrl = process.env.DISCORD_WEBHOOK_URL,
  dryRun = false,
} = {}) {
  const showsFile = await readJson(showsPath, { shows: [] })
  const state = await readJson(statePath, { shows: {} })
  const shows = showsFile.shows ?? []
  let stateChanged = false

  for (const show of shows) {
    const showId = show.id
    const seriesId = resolveSeriesId(show)
    console.log(`Checking ${show.title || showId} (${seriesId})...`)

    const latestSnapshot = await getLatestAvailableEpisodeForSeries(seriesId)
    if (!latestSnapshot) {
      console.log(`  No available episodes found for ${showId}`)
      continue
    }

    const previousState = getShowState(state, showId)
    const actualDropAt = latestSnapshot.episode.premium_available_date

    if (!previousState) {
      state.shows[showId] = createBaselineState(latestSnapshot)
      stateChanged = true
      console.log(
        `  Baseline set to episode ${latestSnapshot.episode.episode} (${latestSnapshot.episode.id})`
      )
      continue
    }

    if (!isNewEpisode(previousState, latestSnapshot)) {
      console.log(
        `  No change (still episode ${latestSnapshot.episode.episode})`
      )
      continue
    }

    const timingStatus = getTimingStatus(show.expectedDropAt, actualDropAt)
    console.log(
      `  New episode ${latestSnapshot.episode.episode}: ${latestSnapshot.episode.title}`
    )
    console.log(`  Timing: ${timingStatus}`)

    if (!dryRun && webhookUrl) {
      await sendEpisodeAlert({
        webhookUrl,
        show,
        latestSnapshot,
        timingStatus,
        expectedDropAt: show.expectedDropAt,
        actualDropAt,
      })
      console.log('  Discord alert sent')
    } else if (!webhookUrl) {
      console.log('  DISCORD_WEBHOOK_URL not set; skipping alert')
    }

    state.shows[showId] = createUpdatedState(latestSnapshot)
    stateChanged = true
  }

  if (stateChanged && !dryRun) {
    await writeJson(statePath, state)
  }

  return { stateChanged, state }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)

if (isMain) {
  const dryRun = process.argv.includes('--dry-run')
  checkShows({ dryRun })
    .then(({ stateChanged }) => {
      if (dryRun) {
        console.log(stateChanged ? 'Dry run complete (state would be updated).' : 'Dry run complete (no changes).')
        return
      }
      console.log(stateChanged ? 'State updated.' : 'No state changes.')
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
