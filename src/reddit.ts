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

const USER_AGENT = 'anime-ep-checker/1.0'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
  const queries = buildSearchQueries(showTitle, episodeNumber, redditSearchTitle)
  const slug = redditSearchTitle?.trim() || slugifyForReddit(showTitle)

  for (let i = 0; i < queries.length; i++) {
    if (i > 0) {
      await sleep(1000)
    }

    const query = queries[i]
    const params = new URLSearchParams({
      q: query,
      restrict_sr: 'on',
      sort: 'new',
      limit: '10',
      t: 'month',
    })

    const response = await fetch(
      `https://www.reddit.com/r/anime/search.json?${params.toString()}`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok) {
      console.warn(`Reddit search failed (${response.status}) for query: ${query}`)
      continue
    }

    const data = (await response.json()) as RedditSearchResponse

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
