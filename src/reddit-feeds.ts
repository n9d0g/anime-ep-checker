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

export interface RedditUserFeedConfig {
  id: string
  username: string
  titlePattern?: RegExp
}

/** Keep in sync with src/should-run.mjs */
export const REDDIT_USER_FEEDS: RedditUserFeedConfig[] = [
  {
    id: 'animecorner',
    username: 'animecorner',
    titlePattern: /^top\s*10\b/i,
  },
  {
    id: 'abysswatcherbel',
    username: 'Abysswatcherbel',
  },
]

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
  now: Date
): boolean {
  const lastSuccessMs = new Date(feedState.checkedAt).getTime()
  if (now.getTime() - lastSuccessMs < ERROR_ALERT_AFTER_MS) {
    return false
  }

  if (!feedState.errorAlertSentAt) {
    return true
  }

  return (
    new Date(feedState.errorAlertSentAt).getTime() < lastSuccessMs
  )
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
}: {
  state: StateFile
  discord: DiscordConfig
  now?: Date
  dryRun?: boolean
}): Promise<{ changed: boolean; reasons: string[] }> {
  const reasons: string[] = []
  let changed = false
  const checkedAt = now.toISOString()
  const nextFeeds = { ...(state.meta?.redditUserFeeds ?? {}) }

  for (const feed of REDDIT_USER_FEEDS) {
    console.log(`Checking Reddit feed u/${feed.username}...`)

    const result = await fetchRedditUserSubmissions(feed.username)
    const feedState = nextFeeds[feed.id]

    if (!result.ok) {
      if (!feedState) {
        console.warn(
          `  Reddit fetch failed (${result.status}); no baseline yet for u/${feed.username}`
        )
        continue
      }

      const shouldAlert = shouldSendFeedErrorAlert(feedState, now)
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
      if (
        feedState.errorAlertSentAt ||
        feedState.lastErrorAt ||
        shouldBumpCheckedAt
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
