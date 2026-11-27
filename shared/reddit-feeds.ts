/**
 * Pure Reddit user feed scheduling: which accounts are watched, when their
 * posting windows are, and when a failing feed counts as stale. Used by both
 * the Actions gate (`src/should-run.ts`) and the checker (`src/reddit-feeds.ts`).
 */

import { getEasternMidnight, getEasternParts } from './time-zone.ts'

/** Posting day plus the following day, to cover late posts. */
const REDDIT_FEED_WINDOW_DAYS = 2
const REDDIT_FEED_POLL_INTERVAL_MS = 15 * 60 * 1000
const CRON_INTERVAL_MS = 5 * 60 * 1000

/**
 * How long a feed may go without a successful fetch (measured from the later
 * of its last success and its posting window opening) before it is stale: the
 * checker sends a one-time error alert, and the gate runs a full check so it can.
 */
const REDDIT_FEED_STALE_MS = 6 * 60 * 60 * 1000

/** Where a feed's posts come from: a Reddit account, or a site's RSS feed. */
export type UserFeedSource =
  | { kind: 'reddit'; username: string }
  | { kind: 'rss'; url: string; name: string }

interface RedditUserFeedConfig {
  id: string
  source: UserFeedSource
  titlePattern?: RegExp
  /** Weekdays (0 = Sunday, Eastern time) the account usually posts. */
  postDays: number[]
}

export interface RedditUserFeedState {
  seenPostIds: string[]
  checkedAt: string
  lastErrorAt?: string
  errorAlertSentAt?: string
  /** Newest matching post seen; polling pauses once it falls in the current window. */
  lastPostPublishedAt?: string
}

export const REDDIT_USER_FEEDS: RedditUserFeedConfig[] = [
  {
    // Anime Corner's own site, not u/animecorner: Reddit blocks logged-out
    // feeds and no longer issues API keys without approval.
    id: 'animecorner-site',
    source: {
      kind: 'rss',
      url: 'https://animecorner.me/feed/',
      name: 'Anime Corner',
    },
    titlePattern: /\brankings?\b/i,
    postDays: [5],
  },
  // u/Abysswatcherbel's karma ranking was retired: their charts are only on
  // Reddit, which blocks logged-out reads.
]

/** How a feed is named in logs and alerts: `u/name` or the site's name. */
export function feedSourceLabel(source: UserFeedSource): string {
  return source.kind === 'reddit' ? `u/${source.username}` : source.name
}

/** Start (Eastern midnight) of the feed's current posting window, or null outside it. */
export function getRedditFeedWindowStart(
  feed: Pick<RedditUserFeedConfig, 'postDays'>,
  now: Date
): Date | null {
  const today = getEasternParts(now.getTime())
  for (let daysBack = 0; daysBack < REDDIT_FEED_WINDOW_DAYS; daysBack++) {
    const day = new Date(
      Date.UTC(today.year, today.month - 1, today.day - daysBack)
    )
    if (feed.postDays.includes(day.getUTCDay())) {
      return getEasternMidnight(
        day.getUTCFullYear(),
        day.getUTCMonth() + 1,
        day.getUTCDate()
      )
    }
  }
  return null
}

/** True on the first cron tick of each poll interval. */
export function isRedditFeedPollSlot(now: Date): boolean {
  const ms = now.getTime()
  return (
    Math.floor(ms / REDDIT_FEED_POLL_INTERVAL_MS) !==
    Math.floor((ms - CRON_INTERVAL_MS) / REDDIT_FEED_POLL_INTERVAL_MS)
  )
}

/** Feed is in its posting window and this window's post has not been seen yet. */
export function isRedditFeedDue(
  feed: Pick<RedditUserFeedConfig, 'postDays'>,
  feedState: Pick<RedditUserFeedState, 'lastPostPublishedAt'> | undefined,
  now: Date
): boolean {
  const windowStart = getRedditFeedWindowStart(feed, now)
  if (!windowStart) {
    return false
  }
  const lastPostMs = feedState?.lastPostPublishedAt
    ? new Date(feedState.lastPostPublishedAt).getTime()
    : 0
  return lastPostMs < windowStart.getTime()
}

export function matchesRedditFeedTitle(
  feed: Pick<RedditUserFeedConfig, 'titlePattern'>,
  title: string
): boolean {
  if (!feed.titlePattern) {
    return true
  }
  return feed.titlePattern.test(title)
}

/**
 * A failing feed is stale and has not been alerted about since its last
 * success. The checker sends the alert; the gate runs a full check so it can.
 */
export function shouldSendFeedErrorAlert(
  feedState: {
    checkedAt: string
    errorAlertSentAt?: string
  },
  now: Date,
  windowStart: Date | null = null
): boolean {
  // Feeds are idle between posting windows, so measure staleness from the
  // window start rather than last week's success.
  const lastSuccessMs = Math.max(
    new Date(feedState.checkedAt).getTime(),
    windowStart?.getTime() ?? 0
  )
  if (now.getTime() - lastSuccessMs < REDDIT_FEED_STALE_MS) {
    return false
  }

  if (!feedState.errorAlertSentAt) {
    return true
  }

  return new Date(feedState.errorAlertSentAt).getTime() < lastSuccessMs
}
