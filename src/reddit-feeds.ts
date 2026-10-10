import {
  sendRedditFeedErrorAlert,
  sendRedditPostAlert,
  type DiscordConfig,
} from './discord.js'
import { fetchRedditUserSubmissions } from './reddit.js'
import type { StateFile } from './types.js'

const SEEN_POST_IDS_LIMIT = 50
const ERROR_ALERT_AFTER_MS = 6 * 60 * 60 * 1000
const CHECKED_AT_BUMP_MS = 60 * 60 * 1000
const EASTERN_TZ = 'America/New_York'
/** Posting day plus the following day, to cover late posts. */
const REDDIT_FEED_WINDOW_DAYS = 2
const REDDIT_FEED_POLL_INTERVAL_MS = 15 * 60 * 1000
const CRON_INTERVAL_MS = 5 * 60 * 1000

export interface RedditUserFeedConfig {
  id: string
  username: string
  titlePattern?: RegExp
  /** Weekdays (0 = Sunday, Eastern time) the account usually posts. */
  postDays: number[]
}

/** Keep in sync with src/should-run.mjs */
export const REDDIT_USER_FEEDS: RedditUserFeedConfig[] = [
  {
    id: 'animecorner',
    username: 'animecorner',
    titlePattern: /^top\s*10\b/i,
    postDays: [5],
  },
  {
    id: 'abysswatcherbel',
    username: 'Abysswatcherbel',
    postDays: [0],
  },
]

function getEasternParts(ms: number): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const result: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== 'literal') {
      result[part.type] = Number(part.value)
    }
  }
  return result
}

function getEasternMidnight(year: number, month: number, day: number): Date {
  const utcMidnight = Date.UTC(year, month - 1, day)
  const p = getEasternParts(utcMidnight)
  const offsetMs =
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) -
    utcMidnight
  return new Date(utcMidnight - offsetMs)
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

export interface RedditUserPost {
  id: string
  title: string
  href: string
  published: string | null
  subreddit: string | null
}

function hasDiscordConfig(discord: DiscordConfig): boolean {
  return Boolean(
    (discord.botToken?.trim() && discord.channelId?.trim()) ||
    discord.webhookUrl?.trim()
  )
}

function matchesFeedTitle(feed: RedditUserFeedConfig, title: string): boolean {
  if (!feed.titlePattern) {
    return true
  }
  return feed.titlePattern.test(title)
}

function sortPostsOldestFirst(posts: RedditUserPost[]): RedditUserPost[] {
  return [...posts].sort((a, b) => {
    const aMs = a.published ? new Date(a.published).getTime() : 0
    const bMs = b.published ? new Date(b.published).getTime() : 0
    if (aMs !== bMs) {
      return aMs - bMs
    }
    return a.id.localeCompare(b.id)
  })
}

function getNewestPublished(
  posts: RedditUserPost[],
  fallback?: string
): string | undefined {
  const times = posts
    .map((post) => post.published ?? fallback)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).toISOString())
    .sort()
  return times.at(-1)
}

function latestIso(...values: (string | undefined)[]): string | undefined {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
}

function trimSeenPostIds(ids: string[], feedOrderIds: string[]): string[] {
  const ordered = feedOrderIds.filter((id) => ids.includes(id))
  const extras = ids.filter((id) => !ordered.includes(id))
  const combined = [...ordered, ...extras]
  return combined.slice(-SEEN_POST_IDS_LIMIT)
}

export interface RedditUserFeedState {
  seenPostIds: string[]
  checkedAt: string
  lastErrorAt?: string
  errorAlertSentAt?: string
  /** Newest matching post seen; polling pauses once it falls in the current window. */
  lastPostPublishedAt?: string
}

/** Persist feed error state without bumping lastErrorAt on every failed poll. */
export function applyRedditFeedFetchFailure(
  feedState: RedditUserFeedState,
  checkedAt: string,
  errorAlertSentAt?: string
): { state: RedditUserFeedState; changed: true } | null {
  const isFirstFailure = !feedState.lastErrorAt

  if (isFirstFailure) {
    const state: RedditUserFeedState = {
      seenPostIds: feedState.seenPostIds,
      checkedAt: feedState.checkedAt,
      lastErrorAt: checkedAt,
    }
    if (feedState.lastPostPublishedAt) {
      state.lastPostPublishedAt = feedState.lastPostPublishedAt
    }
    if (errorAlertSentAt) {
      state.errorAlertSentAt = errorAlertSentAt
    } else if (feedState.errorAlertSentAt) {
      state.errorAlertSentAt = feedState.errorAlertSentAt
    }
    return { state, changed: true }
  }

  if (errorAlertSentAt && errorAlertSentAt !== feedState.errorAlertSentAt) {
    return {
      state: {
        ...feedState,
        errorAlertSentAt,
      },
      changed: true,
    }
  }

  return null
}

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
  if (now.getTime() - lastSuccessMs < ERROR_ALERT_AFTER_MS) {
    return false
  }

  if (!feedState.errorAlertSentAt) {
    return true
  }

  return new Date(feedState.errorAlertSentAt).getTime() < lastSuccessMs
}

export async function fetchUserSubmissions(
  username: string
): Promise<RedditUserPost[] | null> {
  const result = await fetchRedditUserSubmissions(username)
  if (!result.ok) {
    return null
  }
  return result.posts
}

export async function syncRedditUserFeeds({
  state,
  discord,
  now = new Date(),
  dryRun = false,
  force = false,
}: {
  state: StateFile
  discord: DiscordConfig
  now?: Date
  dryRun?: boolean
  force?: boolean
}): Promise<{ changed: boolean; reasons: string[] }> {
  const reasons: string[] = []
  let changed = false
  const checkedAt = now.toISOString()
  const nextFeeds = { ...(state.meta?.redditUserFeeds ?? {}) }

  for (const feed of REDDIT_USER_FEEDS) {
    const feedState = nextFeeds[feed.id]

    if (!force && feedState && !isRedditFeedDue(feed, feedState, now)) {
      console.log(
        `Skipping Reddit feed u/${feed.username} (outside posting window or already found)`
      )
      continue
    }

    console.log(`Checking Reddit feed u/${feed.username}...`)

    const result = await fetchRedditUserSubmissions(feed.username)

    if (!result.ok) {
      if (!feedState) {
        console.warn(
          `  Reddit fetch failed (${result.status}); no baseline yet for u/${feed.username}`
        )
        continue
      }

      const shouldAlert = shouldSendFeedErrorAlert(
        feedState,
        now,
        getRedditFeedWindowStart(feed, now)
      )
      let errorAlertSentAt = feedState.errorAlertSentAt

      if (shouldAlert) {
        if (!dryRun && hasDiscordConfig(discord)) {
          await sendRedditFeedErrorAlert({
            discord,
            username: feed.username,
            status: result.status,
          })
          console.log(
            `  Reddit feed error alert sent for u/${feed.username} (${result.status})`
          )
          errorAlertSentAt = checkedAt
          reasons.push(`reddit feed error u/${feed.username}`)
        } else if (dryRun) {
          console.log(
            `  Would send Reddit feed error alert for u/${feed.username} (${result.status})`
          )
        }
      }

      const failureUpdate = applyRedditFeedFetchFailure(
        feedState,
        checkedAt,
        errorAlertSentAt
      )
      if (failureUpdate) {
        nextFeeds[feed.id] = failureUpdate.state
        changed = true
      }
      continue
    }

    const posts = result.posts
    const matching = posts.filter((post) => matchesFeedTitle(feed, post.title))
    const seenSet = new Set(feedState?.seenPostIds ?? [])
    const isFirstRun = !feedState

    if (isFirstRun) {
      const baselineIds = matching.map((post) => post.id)
      nextFeeds[feed.id] = {
        seenPostIds: trimSeenPostIds(baselineIds, baselineIds),
        checkedAt,
      }
      const newestPublished = getNewestPublished(matching)
      if (newestPublished) {
        nextFeeds[feed.id].lastPostPublishedAt = newestPublished
      }
      changed = true
      reasons.push(`reddit feed baseline u/${feed.username}`)
      console.log(
        `  Baseline set (${baselineIds.length} matching posts); no alerts on first run`
      )
      continue
    }

    const newPosts = sortPostsOldestFirst(
      matching.filter((post) => !seenSet.has(post.id))
    )

    const prevCheckedAt = feedState.checkedAt
    const shouldBumpCheckedAt =
      !prevCheckedAt ||
      now.getTime() - new Date(prevCheckedAt).getTime() > CHECKED_AT_BUMP_MS

    if (newPosts.length === 0) {
      nextFeeds[feed.id] = {
        seenPostIds: feedState.seenPostIds,
        checkedAt: shouldBumpCheckedAt ? checkedAt : prevCheckedAt,
      }
      const lastPostPublishedAt = latestIso(
        getNewestPublished(matching),
        feedState.lastPostPublishedAt
      )
      if (lastPostPublishedAt) {
        nextFeeds[feed.id].lastPostPublishedAt = lastPostPublishedAt
      }
      if (
        feedState.errorAlertSentAt ||
        feedState.lastErrorAt ||
        shouldBumpCheckedAt ||
        lastPostPublishedAt !== feedState.lastPostPublishedAt
      ) {
        changed = true
      }
      console.log('  No new matching posts')
      continue
    }

    const notifiedIds: string[] = []

    for (const post of newPosts) {
      if (!dryRun && hasDiscordConfig(discord)) {
        await sendRedditPostAlert({
          discord,
          username: feed.username,
          post,
        })
        console.log(`  Reddit alert sent: ${post.title}`)
      } else if (dryRun) {
        console.log(`  Would send Reddit alert: ${post.title}`)
      } else {
        console.log(
          `  Discord not configured; skipping Reddit alert for ${post.title}`
        )
        continue
      }

      notifiedIds.push(post.id)
      reasons.push(`reddit post u/${feed.username}: ${post.title}`)
    }

    if (notifiedIds.length === 0 && dryRun) {
      continue
    }

    const feedOrderIds = matching.map((post) => post.id)
    const mergedSeen = trimSeenPostIds(
      [...feedState.seenPostIds, ...notifiedIds],
      feedOrderIds
    )

    nextFeeds[feed.id] = {
      seenPostIds: mergedSeen,
      checkedAt: checkedAt,
    }
    const notifiedPosts = newPosts.filter((post) =>
      notifiedIds.includes(post.id)
    )
    const lastPostPublishedAt = latestIso(
      getNewestPublished(notifiedPosts, checkedAt),
      feedState.lastPostPublishedAt
    )
    if (lastPostPublishedAt) {
      nextFeeds[feed.id].lastPostPublishedAt = lastPostPublishedAt
    }
    changed = true
  }

  if (!dryRun && changed) {
    state.meta = {
      ...state.meta,
      redditUserFeeds: nextFeeds,
    }
  }

  return { changed: dryRun ? false : changed, reasons }
}
