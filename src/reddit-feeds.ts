import {
  hasDiscordConfig,
  sendRedditFeedErrorAlert,
  sendRedditPostAlert,
  type DiscordConfig,
} from './discord.ts'
import { fetchUserFeed } from './site-feed.ts'
import {
  REDDIT_USER_FEEDS,
  feedSourceLabel,
  getRedditFeedWindowStart,
  isRedditFeedDue,
  matchesRedditFeedTitle,
  shouldSendFeedErrorAlert,
  type RedditUserFeedState,
} from '../shared/reddit-feeds.ts'
import type { StateFile } from '../shared/types.ts'

const SEEN_POST_IDS_LIMIT = 50
const CHECKED_AT_BUMP_MS = 60 * 60 * 1000

interface RedditUserPost {
  id: string
  title: string
  href: string
  published: string | null
  subreddit: string | null
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
  const previousFeeds = state.meta?.redditUserFeeds ?? {}
  // Drop state for feeds that are no longer watched (or were renamed).
  const configuredIds = new Set(REDDIT_USER_FEEDS.map((feed) => feed.id))
  const nextFeeds = Object.fromEntries(
    Object.entries(previousFeeds).filter(([id]) => configuredIds.has(id))
  )
  if (Object.keys(nextFeeds).length !== Object.keys(previousFeeds).length) {
    changed = true
  }

  for (const feed of REDDIT_USER_FEEDS) {
    const feedState = nextFeeds[feed.id]
    const label = feedSourceLabel(feed.source)
    const reasonKind = feed.source.kind === 'reddit' ? 'reddit' : 'site'

    if (!force && feedState && !isRedditFeedDue(feed, feedState, now)) {
      console.log(
        `Skipping Reddit feed ${label} (outside posting window or already found)`
      )
      continue
    }

    console.log(`Checking Reddit feed ${label}...`)

    const result = await fetchUserFeed(feed.source)

    if (!result.ok) {
      if (!feedState) {
        console.warn(
          `  Reddit fetch failed (${result.status}); no baseline yet for ${label}`
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
            source: feed.source,
            status: result.status,
          })
          console.log(
            `  Reddit feed error alert sent for ${label} (${result.status})`
          )
          errorAlertSentAt = checkedAt
          reasons.push(`${reasonKind} feed error ${label}`)
        } else if (dryRun) {
          console.log(
            `  Would send Reddit feed error alert for ${label} (${result.status})`
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
    const matching = posts.filter((post) =>
      matchesRedditFeedTitle(feed, post.title)
    )
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
      reasons.push(`${reasonKind} feed baseline ${label}`)
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
          source: feed.source,
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
      reasons.push(`${reasonKind} post ${label}: ${post.title}`)
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
