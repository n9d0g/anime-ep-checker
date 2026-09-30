import { sendRedditPostAlert, type DiscordConfig } from './discord.js'
import {
  parseAtomEntries,
  REDDIT_USER_AGENT,
  type RedditAtomEntry,
} from './reddit.js'
import type { StateFile } from './types.js'

const SEEN_POST_IDS_LIMIT = 50

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

function toUserPost(entry: RedditAtomEntry): RedditUserPost {
  return {
    id: entry.id,
    title: entry.title,
    href: entry.href,
    published: entry.published,
    subreddit: entry.subreddit,
  }
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

export async function fetchUserSubmissions(
  username: string
): Promise<RedditUserPost[] | null> {
  const url = `https://www.reddit.com/user/${username}/submitted.rss?limit=25`
  const response = await fetch(url, {
    headers: {
      'User-Agent': REDDIT_USER_AGENT,
      Accept: 'application/atom+xml,application/rss+xml,application/xml,text/xml,*/*',
    },
  })

  if (response.status === 429) {
    console.warn(
      `Reddit user RSS rate limited (429) for u/${username}; skipping this feed`
    )
    return null
  }

  if (!response.ok) {
    console.warn(
      `Reddit user RSS failed (${response.status}) for u/${username}`
    )
    return null
  }

  const xml = await response.text()
  return parseAtomEntries(xml).map(toUserPost)
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

    const posts = await fetchUserSubmissions(feed.username)
    if (!posts) {
      continue
    }

    const matching = posts.filter((post) => matchesFeedTitle(feed, post.title))
    const feedState = nextFeeds[feed.id]
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

    if (newPosts.length === 0) {
      nextFeeds[feed.id] = {
        seenPostIds: feedState.seenPostIds,
        checkedAt,
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
      checkedAt,
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
