import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  refreshAiringSchedule,
  shouldSaveAiringSchedule,
} from './airing-schedule.ts'
import { getShowState, getTimingStatus } from './compare.ts'
import {
  hasDiscordConfig,
  sendEpisodeAlert,
  sendWaitingAlert,
  type DiscordConfig,
} from './discord.ts'
import { syncWatchingDashboard } from './discord-dashboard.ts'
import {
  clearGoogleCalendarEventForEpisode,
  clearGoogleCalendarEventsForShow,
  getGoogleCalendarConfigFromEnv,
  syncGoogleCalendarEvents,
  type GoogleCalendarConfig,
} from './google-calendar.ts'
import { fetchMalAnimeDetails } from './mal.ts'
import { syncMalScoreAlerts } from './mal-score.ts'
import { syncMalStatusAlerts } from './mal-status.ts'
import { syncPlanToWatchAlerts } from './plan-to-watch.ts'
import {
  createProviderLookup,
  fetchLatestEpisode,
  resolveProviderId,
  type FetchEpisode,
} from './provider-lookup.ts'
import { syncRedditUserFeeds } from './reddit-feeds.ts'
import { findAnimeDiscussionUrl } from './reddit.ts'
import { syncRelatedAnimeAlerts } from './related-anime.ts'
import {
  decideShow,
  planShowLookup,
  type LookupPlan,
  type ShowDecision,
} from './show-decision.ts'
import { writeStateCommitMessage } from './state-commit.ts'
import {
  hasOrphanedShows,
  needsPlanToWatchCheck,
  needsRelatedAnimeCheck,
} from '../shared/schedule.ts'
import { normalizeShowProvider, providerLabel } from '../shared/shows.ts'
import type { EpisodeSnapshot } from './types.ts'
import type { Show, ShowsFile, StateFile } from '../shared/types.ts'

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

export interface CheckOptions {
  showsPath?: string
  statePath?: string
  discord?: DiscordConfig
  calendar?: GoogleCalendarConfig
  /** Provider lookup for Crunchyroll and Netflix shows. */
  fetchEpisode?: FetchEpisode
  dryRun?: boolean
  force?: boolean
}

async function announceEpisode({
  discord,
  calendarConfig,
  dryRun,
  show,
  showId,
  latestSnapshot,
  episodeNumber,
  expectedDropAt,
  state,
  noteStateChange,
}: {
  discord: DiscordConfig
  calendarConfig: GoogleCalendarConfig
  dryRun: boolean
  show: Show
  showId: string
  latestSnapshot: EpisodeSnapshot
  episodeNumber: number
  expectedDropAt: string
  state: StateFile
  noteStateChange: (reason: string) => void
}): Promise<void> {
  const actualDropAt = latestSnapshot.episode.availableAt ?? null
  const timingStatus = getTimingStatus(expectedDropAt, actualDropAt)

  console.log(`  Episode ${episodeNumber} is available`)
  console.log(`  Timing: ${timingStatus}`)

  if (!dryRun) {
    if (hasDiscordConfig(discord)) {
      const discussionUrl = await findAnimeDiscussionUrl(
        show.title || show.id,
        episodeNumber,
        show.redditSearchTitle
      )

      console.log(`  Reddit discussion: ${discussionUrl}`)

      let malDetails = null
      if (show.malId) {
        const malResult = await fetchMalAnimeDetails(show.malId)
        if (malResult.status === 'ok') {
          malDetails = malResult.details
        }
      }

      await sendEpisodeAlert({
        discord,
        show,
        latestSnapshot,
        episodeNumber,
        timingStatus,
        expectedDropAt,
        actualDropAt,
        discussionUrl,
        malDetails,
      })
      console.log('  Discord alert sent')

      // The alert is already out, so a Calendar failure must not fail the show
      // (that would skip saving state and re-send the alert next run).
      try {
        const calendarCleared = await clearGoogleCalendarEventForEpisode(
          calendarConfig,
          showId,
          episodeNumber,
          state
        )
        if (calendarCleared) {
          noteStateChange(
            `Google Calendar event cleared for ${show.title || showId} ep ${episodeNumber}`
          )
          console.log('  Google Calendar event cleared')
        }
      } catch (error) {
        console.warn(
          `  Google Calendar clear failed: ${
            error instanceof Error ? error.message : error
          }`
        )
      }
    } else {
      console.log('  Discord not configured; skipping alert')
    }
  }
}

function logSkippedLookup(plan: Exclude<LookupPlan, { kind: 'look_up' }>) {
  if (plan.kind === 'schedule_ended') {
    console.log('  No next drop: the schedule has no more episodes')
  } else if (plan.kind === 'no_expected_time') {
    console.log(`  Could not compute the next drop time for ep ${plan.episode}`)
  } else {
    console.log(
      `  Outside drop window for next drop ep ${plan.nextDrop.episode} (expected ${plan.nextDrop.expectedAt.toISOString()})`
    )
  }
}

/** Performs the alerts and state writes for one show's decision. */
async function applyDecision(
  decision: ShowDecision,
  {
    discord,
    calendarConfig,
    dryRun,
    show,
    state,
    noteStateChange,
  }: {
    discord: DiscordConfig
    calendarConfig: GoogleCalendarConfig
    dryRun: boolean
    show: Show
    state: StateFile
    noteStateChange: (reason: string) => void
  }
): Promise<void> {
  const showId = show.id
  const showName = show.title || showId

  switch (decision.kind) {
    case 'previous_season_baseline':
      if (!dryRun) {
        state.shows[showId] = decision.state
      }
      noteStateChange(`previous season baseline ${showName}`)
      console.log('  Baseline: previous season only')
      return

    case 'previous_season_on_provider':
      console.log('  Next drop not out: provider still has the previous season')
      return

    case 'baseline': {
      const { episode } = decision.snapshot
      state.shows[showId] = decision.state
      noteStateChange(`baseline ${showName} ep ${episode.episode}`)
      console.log(
        `  Baseline set to episode ${episode.episode} (${episode.id})`
      )
      return
    }

    case 'episode_alert':
      await announceEpisode({
        discord,
        calendarConfig,
        dryRun,
        show,
        showId,
        latestSnapshot: decision.snapshot,
        episodeNumber: decision.episodeNumber,
        expectedDropAt: decision.expectedDropAt,
        state,
        noteStateChange,
      })
      state.shows[showId] = decision.state
      noteStateChange(
        `${decision.catchUp ? 'catch-up episode alert' : 'episode alert'} ${showName} ep ${decision.episodeNumber}`
      )
      return

    case 'still_waiting':
      console.log(
        `  Episode ${decision.episodeNumber} is past its drop; sending still-waiting alert`
      )
      if (!dryRun) {
        if (hasDiscordConfig(discord)) {
          await sendWaitingAlert({
            discord,
            show,
            episodeNumber: decision.episodeNumber,
            expectedDropAt: decision.expectedDropAt,
          })
          console.log('  Discord still-waiting alert sent')
        } else {
          console.log('  Discord not configured; skipping still-waiting alert')
        }
      }
      state.shows[showId] = decision.state
      noteStateChange(
        `still-waiting alert ${showName} ep ${decision.episodeNumber}`
      )
      return

    case 'not_out_yet':
      console.log(
        `  Next drop ep ${decision.episodeNumber} not out yet (latest on ${providerLabel(show.provider)}: ${decision.snapshotEpisode})`
      )
      return
  }
}

function getDiscordConfigFromEnv(): DiscordConfig {
  return {
    botToken: process.env.DISCORD_BOT_TOKEN,
    channelId: process.env.DISCORD_CHANNEL_ID,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  }
}

function getDiscordDashboardConfigFromEnv() {
  return {
    botToken: process.env.DISCORD_BOT_TOKEN,
    watchingChannelId: process.env.DISCORD_WATCHING_CHANNEL_ID,
  }
}

export async function checkShows({
  showsPath = SHOWS_PATH,
  statePath = STATE_PATH,
  discord = getDiscordConfigFromEnv(),
  calendar: calendarConfig = getGoogleCalendarConfigFromEnv(),
  fetchEpisode = fetchLatestEpisode,
  dryRun = false,
  force = false,
}: CheckOptions = {}): Promise<{
  stateChanged: boolean
  state: StateFile
  /** IDs of shows whose check threw; the rest of the run still completed. */
  failedShows: string[]
}> {
  const showsFile = await readJson<ShowsFile>(showsPath, { shows: [] })
  const state = await readJson<StateFile>(statePath, { shows: {} })
  const shows = (showsFile.shows ?? []).map(normalizeShowProvider)
  const now = new Date()
  let stateChanged = false
  const stateChangeReasons: string[] = []
  const failedShows: string[] = []
  const snapshotEpisodes = new Map<string, number>()

  const noteStateChange = (reason: string) => {
    stateChangeReasons.push(reason)
    stateChanged = true
  }

  const providers = createProviderLookup({
    discord,
    dryRun,
    state,
    now,
    noteStateChange,
    fetchEpisode,
  })

  if (hasOrphanedShows(shows, state)) {
    for (const showId of Object.keys(state.shows)) {
      if (shows.some((show) => show.id === showId)) {
        continue
      }

      console.log(`Untracking removed show ${showId}...`)
      try {
        await clearGoogleCalendarEventsForShow(
          calendarConfig,
          showId,
          state,
          dryRun
        )
      } catch (error) {
        console.warn(
          `Google Calendar cleanup failed for ${showId}: ${
            error instanceof Error ? error.message : error
          }`
        )
      }

      if (dryRun) {
        noteStateChange(`would untrack ${showId}`)
        continue
      }

      delete state.shows[showId]
      noteStateChange(`untracked ${showId}`)
    }
  }

  for (const show of shows) {
    try {
      const showId = show.id
      const providerId = resolveProviderId(show)
      const previousState = getShowState(state, showId)

      console.log(
        `Checking ${show.title || showId} (${providerLabel(show.provider)} ${providerId})...`
      )

      // Before planning: the AniList schedule moves the drop window. Saved now
      // on tracked shows; an untracked show gets it with its baseline below.
      const { airingSchedule, episodesChanged, officialSiteUrl } =
        await refreshAiringSchedule({
          show,
          showState: previousState,
          now,
        })
      if (previousState && airingSchedule) {
        const saveSchedule = shouldSaveAiringSchedule(
          previousState.airingSchedule,
          airingSchedule,
          episodesChanged,
          now
        )
        previousState.airingSchedule = airingSchedule
        if (saveSchedule) {
          noteStateChange(
            episodesChanged
              ? `AniList airing schedule ${show.title || showId}`
              : `AniList airing schedule checked ${show.title || showId}`
          )
        }
      }
      if (
        previousState &&
        officialSiteUrl !== undefined &&
        officialSiteUrl !== previousState.officialSiteUrl
      ) {
        previousState.officialSiteUrl = officialSiteUrl
        noteStateChange(`AniList official site ${show.title || showId}`)
      }

      const plan = planShowLookup({
        show,
        previousState,
        now,
        force,
        airingSchedule,
      })
      if (plan.kind !== 'look_up') {
        logSkippedLookup(plan)
        continue
      }
      if (plan.mode) {
        console.log(
          plan.mode === 'drop_window' ? '  In drop window' : '  In late slot'
        )
      }

      const providerSnapshot = await providers.lookUpEpisode(
        show,
        providerId,
        plan.nextDrop.expectedAt
      )
      if (!providerSnapshot) {
        continue
      }

      const decision = decideShow({
        show,
        previousState,
        snapshot: providerSnapshot,
        nextDrop: plan.nextDrop,
        now,
        airingSchedule,
      })
      if ('snapshotEpisode' in decision && decision.snapshotEpisode > 0) {
        snapshotEpisodes.set(showId, decision.snapshotEpisode)
      }

      await applyDecision(decision, {
        discord,
        calendarConfig,
        dryRun,
        show,
        state,
        noteStateChange,
      })
      const savedState = state.shows[showId]
      if (savedState && airingSchedule && !savedState.airingSchedule) {
        savedState.airingSchedule = airingSchedule
      }
      if (
        savedState &&
        officialSiteUrl !== undefined &&
        savedState.officialSiteUrl === undefined
      ) {
        savedState.officialSiteUrl = officialSiteUrl
      }
    } catch (error) {
      failedShows.push(show.id)
      console.error(
        `  Check failed for ${show.title || show.id}: ${
          error instanceof Error ? error.message : error
        }`
      )
    }
  }

  // Saved so the dashboard keeps a stable status between drop windows.
  for (const [showId, episode] of snapshotEpisodes) {
    const showState = state.shows[showId]
    if (showState && showState.lastSnapshotEpisode !== episode) {
      showState.lastSnapshotEpisode = episode
      noteStateChange(`latest snapshot ${showId} ep ${episode}`)
    }
  }

  try {
    const malStatusResult = await syncMalStatusAlerts({
      state,
      discord,
      now,
      dryRun,
    })
    if (malStatusResult.changed) {
      stateChangeReasons.push(...malStatusResult.reasons)
      stateChanged = true
    }
  } catch (error) {
    console.warn(
      `MAL status check failed: ${
        error instanceof Error ? error.message : error
      }`
    )
  }

  if (force || needsPlanToWatchCheck(state, now)) {
    try {
      const ptwResult = await syncPlanToWatchAlerts({
        state,
        discord,
        now,
        dryRun,
      })
      if (ptwResult.changed) {
        stateChangeReasons.push(...ptwResult.reasons)
        stateChanged = true
      }
    } catch (error) {
      console.warn(
        `Plan-to-watch sync failed: ${
          error instanceof Error ? error.message : error
        }`
      )
    }
  }

  // Weekly only, even on forced runs: the admin forces a check on every show
  // edit, and this makes one MAL request per completed title.
  if (needsRelatedAnimeCheck(state, now)) {
    try {
      const relatedResult = await syncRelatedAnimeAlerts({
        state,
        discord,
        now,
        dryRun,
      })
      if (relatedResult.changed) {
        stateChangeReasons.push(...relatedResult.reasons)
        stateChanged = true
      }
    } catch (error) {
      console.warn(
        `Related anime sync failed: ${
          error instanceof Error ? error.message : error
        }`
      )
    }
  }

  // The Actions gate sets REDDIT_FEED_CHECK=false when no feed needs a fetch,
  // so drop-window runs don't hit Reddit again.
  if (force || process.env.REDDIT_FEED_CHECK !== 'false') {
    try {
      const redditResult = await syncRedditUserFeeds({
        state,
        discord,
        now,
        dryRun,
        force,
      })
      if (redditResult.changed) {
        stateChangeReasons.push(...redditResult.reasons)
        stateChanged = true
      }
    } catch (error) {
      console.warn(
        `Reddit user feed sync failed: ${
          error instanceof Error ? error.message : error
        }`
      )
    }
  }

  if (!dryRun) {
    try {
      const scoreResult = await syncMalScoreAlerts({
        shows,
        state,
        discord,
        now,
        dryRun,
      })
      if (scoreResult.changed) {
        stateChangeReasons.push(...scoreResult.reasons)
        stateChanged = true
      }
    } catch (error) {
      console.warn(
        `MAL score sync failed: ${
          error instanceof Error ? error.message : error
        }`
      )
    }

    try {
      const dashboardResult = await syncWatchingDashboard({
        config: getDiscordDashboardConfigFromEnv(),
        shows,
        state,
        now,
        dryRun,
      })
      if (dashboardResult.changed) {
        stateChangeReasons.push(...dashboardResult.reasons)
        stateChanged = true
      }
    } catch (error) {
      console.warn(
        `Watching dashboard sync failed: ${
          error instanceof Error ? error.message : error
        }`
      )
    }

    try {
      const calendarChanged = await syncGoogleCalendarEvents({
        config: calendarConfig,
        shows,
        state,
        now,
        dryRun,
      })
      if (calendarChanged) {
        stateChangeReasons.push('Google Calendar events updated')
        stateChanged = true
      }
    } catch (error) {
      console.warn(
        `Google Calendar sync failed: ${
          error instanceof Error ? error.message : error
        }`
      )
    }
  }

  if (stateChanged && !dryRun) {
    await writeJson(statePath, state)
    writeStateCommitMessage(stateChangeReasons)
  }

  return { stateChanged, state, failedShows }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const dryRun = process.argv.includes('--dry-run')
  const force = process.argv.includes('--force')

  checkShows({ dryRun, force })
    .then(({ stateChanged, failedShows }) => {
      if (failedShows.length > 0) {
        console.error(`Checks failed for: ${failedShows.join(', ')}`)
        process.exitCode = 1
      }
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
