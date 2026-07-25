// Zero-dep gate for GitHub Actions (node --experimental-strip-types, no pnpm install).
// Schedule logic mirrors src/schedule.ts — keep window constants and helpers in sync.
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000
const WINDOW_BEFORE_MS = 1 * 60 * 1000
const WINDOW_AFTER_DENSE_MS = 90 * 60 * 1000
const LATE_POLL_INTERVAL_MS = 30 * 60 * 1000
const CRON_INTERVAL_MS = 5 * 60 * 1000

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHOWS_PATH = resolve(ROOT, 'shows.json')
const STATE_PATH = resolve(ROOT, 'state.json')

interface ShowSchedule {
  mode: string
  startAt: string
  startEpisode: number
  episodeCount: number | null
  premiereBatchSize: number
}

interface Show {
  id: string
  schedule: ShowSchedule
}

interface ShowState {
  lastEpisodeNumber: string
}

interface ShowsFile {
  shows: Show[]
}

interface StateFile {
  shows: Record<string, ShowState>
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

function getPremiereBatchSize(schedule: ShowSchedule): number {
  return schedule.premiereBatchSize > 0 ? schedule.premiereBatchSize : 1
}

function getLastScheduledEpisode(schedule: ShowSchedule): number | null {
  if (schedule.mode === 'ongoing' || schedule.episodeCount === null) {
    return null
  }
  return schedule.startEpisode + schedule.episodeCount - 1
}

function isEpisodeInSchedule(schedule: ShowSchedule, episodeNumber: number): boolean {
  if (episodeNumber < schedule.startEpisode) {
    return false
  }
  const lastEpisode = getLastScheduledEpisode(schedule)
  if (lastEpisode !== null && episodeNumber > lastEpisode) {
    return false
  }
  return true
}

function getExpectedDropAt(schedule: ShowSchedule, episodeNumber: number): Date | null {
  if (!isEpisodeInSchedule(schedule, episodeNumber)) {
    return null
  }
  const start = new Date(schedule.startAt)
  if (Number.isNaN(start.getTime())) {
    return null
  }
  const batchSize = getPremiereBatchSize(schedule)
  const batchEnd = schedule.startEpisode + batchSize - 1
  if (episodeNumber <= batchEnd) {
    return start
  }
  const weeksAfterBatch = episodeNumber - batchEnd
  return new Date(start.getTime() + weeksAfterBatch * MS_PER_WEEK)
}

function getNextExpectedEpisode(
  schedule: ShowSchedule,
  lastEpisodeNumber: number | null
): number | null {
  const next =
    lastEpisodeNumber === null ? schedule.startEpisode : lastEpisodeNumber + 1
  if (!isEpisodeInSchedule(schedule, next)) {
    return null
  }
  return next
}

function isInDenseCheckWindow(expectedAt: Date, now: Date): boolean {
  const nowMs = now.getTime()
  const expectedMs = expectedAt.getTime()
  return (
    nowMs >= expectedMs - WINDOW_BEFORE_MS &&
    nowMs <= expectedMs + WINDOW_AFTER_DENSE_MS
  )
}

function isInLateCheckSlot(expectedAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - (expectedAt.getTime() + WINDOW_AFTER_DENSE_MS)
  if (elapsed < 0) {
    return false
  }

  return (
    Math.floor(elapsed / LATE_POLL_INTERVAL_MS) !==
    Math.floor((elapsed - CRON_INTERVAL_MS) / LATE_POLL_INTERVAL_MS)
  )
}

function isInCheckWindow(expectedAt: Date, now: Date): boolean {
  return isInDenseCheckWindow(expectedAt, now) || isInLateCheckSlot(expectedAt, now)
}

function getCheckWindowMode(
  expectedAt: Date,
  now: Date
): 'dense' | 'late' | null {
  if (isInDenseCheckWindow(expectedAt, now)) {
    return 'dense'
  }
  if (isInLateCheckSlot(expectedAt, now)) {
    return 'late'
  }
  return null
}

function parseEpisodeNumber(value: string | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function showNeedsCheck(show: Show, state: StateFile, now: Date): boolean {
  const previousState = state.shows[show.id] ?? null
  const lastEpisodeNumber = previousState
    ? parseEpisodeNumber(previousState.lastEpisodeNumber)
    : null
  const nextExpectedEp = getNextExpectedEpisode(show.schedule, lastEpisodeNumber)
  if (nextExpectedEp === null) {
    return false
  }
  const expectedAt = getExpectedDropAt(show.schedule, nextExpectedEp)
  if (!expectedAt) {
    return false
  }
  return isInCheckWindow(expectedAt, now)
}

function getActiveCheckModes(
  shows: Show[],
  state: StateFile,
  now: Date
): Array<'dense' | 'late'> {
  const modes = new Set<'dense' | 'late'>()

  for (const show of shows) {
    const previousState = state.shows[show.id] ?? null
    const lastEpisodeNumber = previousState
      ? parseEpisodeNumber(previousState.lastEpisodeNumber)
      : null
    const nextExpectedEp = getNextExpectedEpisode(show.schedule, lastEpisodeNumber)
    if (nextExpectedEp === null) {
      continue
    }
    const expectedAt = getExpectedDropAt(show.schedule, nextExpectedEp)
    if (!expectedAt) {
      continue
    }
    const mode = getCheckWindowMode(expectedAt, now)
    if (mode) {
      modes.add(mode)
    }
  }

  return [...modes]
}

const showsFile = readJson<ShowsFile>(SHOWS_PATH, { shows: [] })
const state = readJson<StateFile>(STATE_PATH, { shows: {} })
const now = new Date()
const shows = showsFile.shows ?? []
const needsCheck = shows.some((show) => showNeedsCheck(show, state, now))
const activeModes = getActiveCheckModes(shows, state, now)

const outputFile = process.env.GITHUB_OUTPUT
if (outputFile) {
  appendFileSync(outputFile, `should_check=${needsCheck}\n`)
}

if (needsCheck) {
  const modeLabel = activeModes.join(' + ') || 'active'
  console.log(`At least one show is in the ${modeLabel} check window.`)
} else {
  console.log('No shows in active check window; skipping full check.')
}
