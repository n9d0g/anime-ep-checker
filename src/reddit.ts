const USER_AGENT = 'anime-ep-checker/1.0'
const AUTOLOVEPON_AUTHOR = 'AutoLovepon'
const RSS_SEARCH_URL = 'https://www.reddit.com/r/anime/search.rss'

interface AtomEntry {
  title: string
  href: string
  author: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

export function slugifyForReddit(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildSearchQueries(
  showTitle: string,
  episodeNumber: number,
  redditSearchTitle?: string
): string[] {
  const base = redditSearchTitle?.trim() || slugifyForReddit(showTitle)
  const titleSlug = slugifyForReddit(showTitle)

  const queries = [
    `${base}_-_episode_${episodeNumber}_discussion`,
    `${base}_episode_${episodeNumber}_discussion`,
  ]

  if (titleSlug && titleSlug !== base) {
    queries.push(`${titleSlug}_-_episode_${episodeNumber}_discussion`)
  }

  return [...new Set(queries)]
}

function matchesDiscussionThread(
  title: string,
  episodeNumber: number,
  slug: string
): boolean {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const slugNorm = slug.toLowerCase().replace(/[^a-z0-9]+/g, '_')

  return (
    normalized.includes(slugNorm) &&
    (normalized.includes(`episode_${episodeNumber}`) ||
      normalized.includes(`episode${episodeNumber}`))
  )
}

export function parseAtomEntries(xml: string): AtomEntry[] {
  const entries: AtomEntry[] = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g

  for (const match of xml.matchAll(entryRegex)) {
    const block = match[1]
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? ''
    const author = block.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? ''
    const link =
      block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] ??
      block.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/)?.[1] ??
      block.match(/<link[^>]*href="([^"]+)"/)?.[1] ??
      ''

    if (title && link) {
      entries.push({
        title: decodeXmlEntities(title.trim()),
        href: link,
        author: author.trim(),
      })
    }
  }

  return entries
}

function isAutoLoveponEntry(entry: AtomEntry): boolean {
  return entry.author.toLowerCase().includes(AUTOLOVEPON_AUTHOR.toLowerCase())
}

export function buildAnimeDiscussionSearchUrl(
  showTitle: string,
  episodeNumber: number,
  redditSearchTitle?: string
): string {
  const [primaryQuery] = buildSearchQueries(showTitle, episodeNumber, redditSearchTitle)
  const params = new URLSearchParams({
    q: primaryQuery,
    restrict_sr: 'on',
    sort: 'new',
  })

  return `https://www.reddit.com/r/anime/search/?${params.toString()}`
}

async function fetchAutoLoveponDiscussionUrl(
  query: string,
  episodeNumber: number,
  slug: string
): Promise<string | null> {
  const params = new URLSearchParams({
    q: `author:${AUTOLOVEPON_AUTHOR} ${query}`,
    restrict_sr: 'on',
    sort: 'new',
    limit: '10',
  })

  const response = await fetch(`${RSS_SEARCH_URL}?${params.toString()}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/atom+xml,application/rss+xml,application/xml,text/xml,*/*',
    },
  })

  if (!response.ok) {
    console.warn(`Reddit RSS search failed (${response.status}) for query: ${query}`)
    return null
  }

  const xml = await response.text()
  const entries = parseAtomEntries(xml)

  for (const entry of entries) {
    if (!isAutoLoveponEntry(entry)) {
      continue
    }

    if (matchesDiscussionThread(entry.title, episodeNumber, slug)) {
      return entry.href
    }
  }

  return null
}

export async function findAnimeDiscussionUrl(
  showTitle: string,
  episodeNumber: number,
  redditSearchTitle?: string
): Promise<string> {
  const queries = buildSearchQueries(showTitle, episodeNumber, redditSearchTitle)
  const slug = redditSearchTitle?.trim() || slugifyForReddit(showTitle)
  const fallbackUrl = buildAnimeDiscussionSearchUrl(
    showTitle,
    episodeNumber,
    redditSearchTitle
  )

  for (let i = 0; i < queries.length; i++) {
    if (i > 0) {
      await sleep(1000)
    }

    const permalink = await fetchAutoLoveponDiscussionUrl(
      queries[i],
      episodeNumber,
      slug
    )

    if (permalink) {
      return permalink
    }
  }

  return fallbackUrl
}
