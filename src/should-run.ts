// Cheap Actions gate: decides whether the full check needs to run this cron
// tick. Runs on plain Node with no `pnpm install` (ADR 0002), so everything it
// imports must stay free of npm dependencies.
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  REDDIT_USER_FEEDS,
  getRedditFeedWindowStart,
  isRedditFeedDue,
  isRedditFeedPollSlot,
  matchesRedditFeedTitle,
  shouldSendFeedErrorAlert,
} from '../shared/reddit-feeds.ts'
import {
  getDropWindowMode,
  getNextDrop,
  hasOrphanedShows,
  needsPlanToWatchCheck,
  needsRelatedAnimeCheck,
  type DropWindowMode,
} from '../shared/schedule.ts'
import type { Show, StateFile } from '../shared/types.ts'
import {
  fetchRedditUserSubmissions,
  type RedditUserFetchResult,
} from './reddit.ts'

type FetchRedditFeed = (username: string) => Promise<RedditUserFetchResult>

interface GateDecision {
  /** Run the full check (`should_check`). */
  shouldCheck: boolean
  /** The full check should fetch Reddit user feeds (`reddit_check`). */
  redditCheck: boolean
  /** Human-readable reasons, for the job log. */
  reasons: string[]
}

/** Whether the show's next drop puts it in its drop window or a late slot now. */
function getShowDropWindowMode(
  show: Show,
  state: StateFile,
  now: Date
): DropWindowMode | null {
  const showState = state.shows[show.id]
  const nextDrop = getNextDrop(
    show.schedule,
    showState?.lastEpisodeNumber,
    showState?.airingSchedule
  )
  if (!nextDrop?.expectedAt) {
    return null
  }
  return getDropWindowMode(nextDrop.expectedAt, now)
}

async function needsRedditFeedCheck(
  state: StateFile,
  now: Date,
  fetchRedditFeed: FetchRedditFeed
): Promise<boolean> {
  const feedStates = state.meta?.redditUserFeeds ?? {}

  for (const feed of REDDIT_USER_FEEDS) {
    const feedState = feedStates[feed.id]
    if (!feedState) {
      // No baseline yet; the full check records one.
      return true
    }

    // Only poll on the account's posting day (+1 grace day, Eastern), every
    // 15 minutes, until this window's post has been seen.
    if (!isRedditFeedDue(feed, feedState, now) || !isRedditFeedPollSlot(now)) {
      continue
    }

    const result = await fetchRedditFeed(feed.username)
    if (!result.ok) {
      // A full run is only worth it when the checker would send the stale
      // feed alert; otherwise wait for the next poll slot.
      if (
        shouldSendFeedErrorAlert(
          feedState,
          now,
          getRedditFeedWindowStart(feed, now)
        )
      ) {
        console.log(
          `Reddit feed u/${feed.username} fetch failed; last success is stale — running full check`
        )
        return true
      }
      continue
    }

    const seen = new Set(feedState.seenPostIds ?? [])
    const hasNew = result.posts.some(
      (post) => matchesRedditFeedTitle(feed, post.title) && !seen.has(post.id)
    )
    if (hasNew) {
      return true
    }
  }

  return false
}

export async function decideGate({
  shows,
  state,
  now,
  fetchRedditFeed = fetchRedditUserSubmissions,
}: {
  shows: Show[]
  state: StateFile
  now: Date
  fetchRedditFeed?: FetchRedditFeed
}): Promise<GateDecision> {
  const reasons: string[] = []

  const dropWindowModes = new Set<DropWindowMode>()
  for (const show of shows) {
    const mode = getShowDropWindowMode(show, state, now)
    if (mode) {
      dropWindowModes.add(mode)
    }
  }
  if (dropWindowModes.size > 0) {
    const modeLabel = [...dropWindowModes]
      .map((mode) => (mode === 'drop_window' ? 'drop window' : 'late slot'))
      .join(' + ')
    reasons.push(`At least one show is in its ${modeLabel}.`)
  }

  const needsPtwCheck = needsPlanToWatchCheck(state, now)
  if (needsPtwCheck) {
    reasons.push('Plan-to-watch check is due (24h cadence).')
  }

  const needsRelatedCheck = needsRelatedAnimeCheck(state, now)
  if (needsRelatedCheck) {
    reasons.push('Related anime check is due (weekly, Sundays).')
  }

  const hasOrphans = hasOrphanedShows(shows, state)
  if (hasOrphans) {
    reasons.push('Removed show still present in state; running cleanup.')
  }

  const redditCheck = await needsRedditFeedCheck(state, now, fetchRedditFeed)
  if (redditCheck) {
    reasons.push('Reddit user feed check needed (new post or baseline).')
  }

  return {
    shouldCheck:
      dropWindowModes.size > 0 ||
      needsPtwCheck ||
      needsRelatedCheck ||
      hasOrphans ||
      redditCheck,
    redditCheck,
    reasons,
  }
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T
  } catch {
    return fallback
  }
}

async function main(): Promise<void> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const showsFile = readJson<{ shows?: Show[] }>(
    process.env.SHOWS_PATH ?? resolve(root, 'shows.json'),
    { shows: [] }
  )
  const stateFile = readJson<Partial<StateFile>>(
    process.env.STATE_PATH ?? resolve(root, 'state.json'),
    {}
  )

  const decision = await decideGate({
    shows: showsFile.shows ?? [],
    state: { ...stateFile, shows: stateFile.shows ?? {} },
    now: new Date(),
  })

  const outputFile = process.env.GITHUB_OUTPUT
  if (outputFile) {
    appendFileSync(outputFile, `should_check=${decision.shouldCheck}\n`)
    appendFileSync(outputFile, `reddit_check=${decision.redditCheck}\n`)
  }

  if (decision.shouldCheck) {
    for (const reason of decision.reasons) {
      console.log(reason)
    }
  } else {
    console.log(
      'No shows in their drop window, plan-to-watch/related checks not due, and no new Reddit posts; skipping full check.'
    )
  }
}

if (import.meta.main) {
  await main()
}
