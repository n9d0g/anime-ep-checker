import {
  fetchRedditUserSubmissions,
  type RedditUserFetchResult,
} from './reddit.ts'
import type { UserFeedSource } from '../shared/reddit-feeds.ts'

const USER_AGENT = 'node:anime-ep-checker:1.0 (by /u/n9d0g)'

function decodeXmlText(value: string): string {
  return value
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16))
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function readTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))
  return match ? decodeXmlText(match[1]) : null
}

/** Posts from an RSS 2.0 feed (`<item>` entries), in feed order. */
export function parseRssItems(
  xml: string
): Extract<RedditUserFetchResult, { ok: true }>['posts'] {
  const posts: Extract<RedditUserFetchResult, { ok: true }>['posts'] = []

  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = match[1]
    const title = readTag(block, 'title')
    const href = readTag(block, 'link')
    if (!title || !href) {
      continue
    }

    const pubDate = readTag(block, 'pubDate')
    const publishedMs = pubDate ? new Date(pubDate).getTime() : NaN

    posts.push({
      id: readTag(block, 'guid') || href,
      title,
      href,
      published: Number.isNaN(publishedMs)
        ? null
        : new Date(publishedMs).toISOString(),
      subreddit: null,
    })
  }

  return posts
}

async function fetchRssFeed(url: string): Promise<RedditUserFetchResult> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml,application/xml,text/xml,*/*',
    },
  })

  if (!response.ok) {
    console.warn(`RSS feed failed (${response.status}) for ${url}`)
    return { ok: false, status: response.status }
  }

  return { ok: true, posts: parseRssItems(await response.text()) }
}

/** Fetch a watched feed's latest posts from Reddit or the site's RSS. */
export function fetchUserFeed(
  source: UserFeedSource
): Promise<RedditUserFetchResult> {
  return source.kind === 'reddit'
    ? fetchRedditUserSubmissions(source.username)
    : fetchRssFeed(source.url)
}
