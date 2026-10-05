export const REDDIT_USER_AGENT =
  'node:anime-ep-checker:1.0 (by /u/n9d0g)'
const USER_AGENT = REDDIT_USER_AGENT

export interface RedditUserSubmission {
  id: string
  title: string
  href: string
  published: string | null
  subreddit: string | null
}

export type RedditUserFetchResult =
  | { ok: true; posts: RedditUserSubmission[] }
  | { ok: false; status: number }

let cachedOAuthToken: { token: string; expiresAt: number } | null = null

export function clearRedditOAuthTokenCache(): void {
  cachedOAuthToken = null
}

export function getRedditCredentials(): {
  clientId: string
  clientSecret: string
} | null {
  const clientId = process.env.REDDIT_CLIENT_ID?.trim()
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    return null
  }
  return { clientId, clientSecret }
}

export async function getRedditAccessToken(): Promise<string | null> {
  const creds = getRedditCredentials()
  if (!creds) {
    return null
  }

  const now = Date.now()
  if (cachedOAuthToken && cachedOAuthToken.expiresAt > now + 60_000) {
    return cachedOAuthToken.token
  }

  const basic = Buffer.from(
    `${creds.clientId}:${creds.clientSecret}`
  ).toString('base64')

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'User-Agent': REDDIT_USER_AGENT,
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    console.warn(`Reddit OAuth token failed (${response.status})`)
    return null
  }

  const data = (await response.json()) as {
    access_token: string
    expires_in: number
  }

  cachedOAuthToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  }

  return cachedOAuthToken.token
}

interface OAuthListingChild {
  data?: {
    id?: string
    title?: string
    permalink?: string
    created_utc?: number
    subreddit?: string
  }
}

export function mapOAuthListingToSubmissions(
  json: { data?: { children?: OAuthListingChild[] } }
): RedditUserSubmission[] {
  const children = json.data?.children ?? []
  const posts: RedditUserSubmission[] = []

  for (const child of children) {
    const data = child.data
    if (!data?.id || !data.title || !data.permalink) {
      continue
    }

    posts.push({
      id: `t3_${data.id}`,
      title: data.title,
      href: data.permalink.startsWith('http')
        ? data.permalink
        : `https://www.reddit.com${data.permalink}`,
      published:
        typeof data.created_utc === 'number'
          ? new Date(data.created_utc * 1000).toISOString()
          : null,
      subreddit: data.subreddit ?? null,
    })
  }

  return posts
}

async function fetchUserSubmissionsOAuth(
  username: string,
  token: string
): Promise<RedditUserFetchResult> {
  const url = `https://oauth.reddit.com/user/${username}/submitted?limit=25&raw_json=1`
  const response = await fetch(url, {
    headers: {
      'User-Agent': REDDIT_USER_AGENT,
      Authorization: `bearer ${token}`,
    },
  })

  if (response.status === 429) {
    console.warn(
      `Reddit OAuth rate limited (429) for u/${username}; skipping this feed`
    )
    return { ok: false, status: 429 }
  }

  if (!response.ok) {
    console.warn(
      `Reddit OAuth listing failed (${response.status}) for u/${username}`
    )
    return { ok: false, status: response.status }
  }

  const json = (await response.json()) as {
    data?: { children?: OAuthListingChild[] }
  }
  return { ok: true, posts: mapOAuthListingToSubmissions(json) }
}

async function fetchUserSubmissionsRss(
  username: string
): Promise<RedditUserFetchResult> {
  const url = `https://www.reddit.com/user/${username}/submitted.rss?limit=25`
  const response = await fetch(url, {
    headers: {
      'User-Agent': REDDIT_USER_AGENT,
      Accept:
        'application/atom+xml,application/rss+xml,application/xml,text/xml,*/*',
    },
  })

  if (response.status === 429) {
    console.warn(
      `Reddit user RSS rate limited (429) for u/${username}; skipping this feed`
    )
    return { ok: false, status: 429 }
  }

  if (!response.ok) {
    console.warn(
      `Reddit user RSS failed (${response.status}) for u/${username}`
    )
    return { ok: false, status: response.status }
  }

  const xml = await response.text()
  const posts = parseAtomEntries(xml).map((entry) => ({
    id: entry.id,
    title: entry.title,
    href: entry.href,
    published: entry.published,
    subreddit: entry.subreddit,
  }))

  return { ok: true, posts }
}

export async function fetchRedditUserSubmissions(
  username: string
): Promise<RedditUserFetchResult> {
  const token = await getRedditAccessToken()
  if (token) {
    return fetchUserSubmissionsOAuth(username, token)
  }
  return fetchUserSubmissionsRss(username)
}
const AUTOLOVEPON_AUTHOR = 'AutoLovepon'
const RSS_SEARCH_URL = 'https://www.reddit.com/r/anime/search.rss'

let redditRateLimited = false

export interface RedditAtomEntry {
  id: string
  title: string
  href: string
  author: string
  published: string | null
  subreddit: string | null
}

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

function slugifyForReddit(value: string): string {
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

function extractPostId(rawId: string): string {
  const trimmed = rawId.trim()
  const t3Match = trimmed.match(/(t3_[a-z0-9]+)/i)
  if (t3Match) {
    return t3Match[1]
  }
  return trimmed
}

function parseSubredditFromEntry(block: string): string | null {
  const categories = [
    ...block.matchAll(/<category[^>]*term="([^"]+)"/g),
  ].map((match) => match[1])

  for (const term of categories) {
    if (!term.startsWith('u_')) {
      return term
    }
  }

  return null
}

export function parseAtomEntries(xml: string): RedditAtomEntry[] {
  const entries: RedditAtomEntry[] = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g

  for (const match of xml.matchAll(entryRegex)) {
    const block = match[1]
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? ''
    const author = block.match(/<name>([\s\S]*?)<\/name>/)?.[1] ?? ''
    const rawId = block.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? ''
    const published =
      block.match(/<published>([\s\S]*?)<\/published>/)?.[1] ??
      block.match(/<updated>([\s\S]*?)<\/updated>/)?.[1] ??
      null
    const link =
      block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] ??
      block.match(/<link[^>]*href="([^"]+)"[^>]*rel="alternate"/)?.[1] ??
      block.match(/<link[^>]*href="([^"]+)"/)?.[1] ??
      ''

    if (title && link) {
      const decodedTitle = decodeXmlEntities(title.trim())
      if (decodedTitle.toLowerCase().startsWith('submitted by ')) {
        continue
      }

      entries.push({
        id: extractPostId(decodeXmlEntities(rawId)),
        title: decodedTitle,
        href: link,
        author: author.trim(),
        published: published?.trim() ?? null,
        subreddit: parseSubredditFromEntry(block),
      })
    }
  }

  return entries
}

function parseAtomEntriesForDiscussion(xml: string): AtomEntry[] {
  return parseAtomEntries(xml).map((entry) => ({
    title: entry.title,
    href: entry.href,
    author: entry.author,
  }))
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
  if (redditRateLimited) {
    return null
  }

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

  if (response.status === 429) {
    redditRateLimited = true
    console.warn(
      'Reddit RSS search rate limited (429); skipping further Reddit requests this run'
    )
    return null
  }

  if (!response.ok) {
    console.warn(`Reddit RSS search failed (${response.status}) for query: ${query}`)
    return null
  }

  const xml = await response.text()
  const entries = parseAtomEntriesForDiscussion(xml)

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

export async function findAnimeDiscussionPermalink(
  showTitle: string,
  episodeNumber: number,
  redditSearchTitle?: string
): Promise<string | null> {
  const queries = buildSearchQueries(showTitle, episodeNumber, redditSearchTitle)
  const slug = redditSearchTitle?.trim() || slugifyForReddit(showTitle)

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

  return null
}

export async function findAnimeDiscussionUrl(
  showTitle: string,
  episodeNumber: number,
  redditSearchTitle?: string
): Promise<string> {
  const permalink = await findAnimeDiscussionPermalink(
    showTitle,
    episodeNumber,
    redditSearchTitle
  )

  if (permalink) {
    return permalink
  }

  return buildAnimeDiscussionSearchUrl(showTitle, episodeNumber, redditSearchTitle)
}
