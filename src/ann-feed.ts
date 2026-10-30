// Anime News Network's news headlines (RSS, no key), read alongside each
// show's official site for announced breaks.
const ANN_FEED_URL =
  'https://www.animenewsnetwork.com/all/rss.xml?ann-edition=us'
const FEED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 15_000

export interface AnnNewsItem {
  title: string
  url: string
  publishedAt: string
}

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function readTag(item: string, tag: string): string | null {
  const match = item.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return match ? decodeEntities(match[1]).trim() : null
}

/** News items (not reviews or columns) published in the last 7 days. */
export function parseAnnFeed(xml: string, now: Date): AnnNewsItem[] {
  const items: AnnNewsItem[] = []
  for (const [, item] of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = readTag(item, 'title')
    const url = readTag(item, 'link')
    const publishedMs = Date.parse(readTag(item, 'pubDate') ?? '')
    if (!title || !url?.includes('/news/') || Number.isNaN(publishedMs)) {
      continue
    }
    if (now.getTime() - publishedMs > FEED_WINDOW_MS) {
      continue
    }
    items.push({
      title,
      url,
      publishedAt: new Date(publishedMs).toISOString(),
    })
  }
  return items
}

/** The last 7 days of ANN news, or null when the feed can't be read. */
export async function fetchAnnNews(now: Date): Promise<AnnNewsItem[] | null> {
  try {
    const response = await fetch(ANN_FEED_URL, {
      headers: { 'User-Agent': 'anime-ep-checker' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.warn(`ANN news feed failed (${response.status})`)
      return null
    }
    return parseAnnFeed(await response.text(), now)
  } catch (error) {
    console.warn(
      `ANN news feed failed: ${error instanceof Error ? error.message : error}`
    )
    return null
  }
}
