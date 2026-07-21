interface RedditTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

interface RedditSearchChild {
  data?: {
    title?: string
    permalink?: string
    subreddit?: string
  }
}

interface RedditSearchResponse {
  data?: {
    children?: RedditSearchChild[]
  }
}

let cachedToken: string | null = null
let tokenExpiresAt = 0

function getRedditConfig() {
  const clientId = process.env.REDDIT_CLIENT_ID?.trim()
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim()
  const userAgent = process.env.REDDIT_USER_AGENT?.trim()

  if (!clientId || !clientSecret || !userAgent) {
    return null
  }

  return { clientId, clientSecret, userAgent }
}

async function getRedditAccessToken(): Promise<string | null> {
  const config = getRedditConfig()
  if (!config) return null

  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken
  }

  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString(
    'base64'
  )

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.userAgent,
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    console.warn(`Reddit auth failed (${response.status})`)
    return null
  }

  const data = (await response.json()) as RedditTokenResponse
  cachedToken = data.access_token
  tokenExpiresAt = now + (data.expires_in ?? 3600) * 1000
  return cachedToken
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

export async function findAnimeDiscussionUrl(
  showTitle: string,
  episodeNumber: number,
  redditSearchTitle?: string
): Promise<string | null> {
  const token = await getRedditAccessToken()
  const config = getRedditConfig()
  if (!token || !config) {
    return null
  }

  const queries = buildSearchQueries(showTitle, episodeNumber, redditSearchTitle)

  for (const query of queries) {
    const params = new URLSearchParams({
      q: query,
      restrict_sr: 'on',
      sort: 'new',
      limit: '10',
      t: 'month',
    })

    const response = await fetch(
      `https://oauth.reddit.com/r/anime/search?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': config.userAgent,
        },
      }
    )

    if (!response.ok) {
      console.warn(`Reddit search failed (${response.status}) for query: ${query}`)
      continue
    }

    const data = (await response.json()) as RedditSearchResponse
    const slug = redditSearchTitle?.trim() || slugifyForReddit(showTitle)

    for (const child of data.data?.children ?? []) {
      const title = child.data?.title ?? ''
      const permalink = child.data?.permalink
      if (!permalink || child.data?.subreddit?.toLowerCase() !== 'anime') {
        continue
      }

      if (matchesDiscussionThread(title, episodeNumber, slug)) {
        return `https://www.reddit.com${permalink}`
      }
    }
  }

  return null
}
