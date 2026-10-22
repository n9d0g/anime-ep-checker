// AniList airing schedules (no API key): the Disney+ fallback's latest aired
// episode, and the per-episode broadcast times the schedule uses for breaks.
const ANILIST_URL = 'https://graphql.anilist.co'

/** 50 per page; a show with more episodes than this reads only the first 200. */
const AIRING_PAGE_SIZE = 50
const MAX_AIRING_PAGES = 4

const AIRING_SCHEDULE_QUERY = `
query ($malId: Int, $page: Int) {
  Media(idMal: $malId, type: ANIME) {
    title {
      romaji
      english
    }
    airingSchedule(page: $page, perPage: ${AIRING_PAGE_SIZE}) {
      pageInfo {
        hasNextPage
      }
      nodes {
        episode
        airingAt
      }
    }
  }
}
`

interface AnilistAiringNode {
  episode?: number
  airingAt?: number
}

interface AnilistMediaResponse {
  data?: {
    Media?: {
      title?: {
        romaji?: string | null
        english?: string | null
      }
      airingSchedule?: {
        pageInfo?: { hasNextPage?: boolean | null } | null
        nodes?: AnilistAiringNode[] | null
      } | null
    } | null
  }
  errors?: Array<{ message?: string }>
}

/** An aired or scheduled episode: number and broadcast time (Unix seconds). */
export interface AnilistAiring {
  episode: number
  airingAt: number
}

interface AnilistAiringResult {
  seriesTitle: string
  nodes: AnilistAiring[]
}

async function fetchAiringPage(
  malId: number,
  page: number
): Promise<AnilistMediaResponse | null> {
  let response: Response
  try {
    response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: AIRING_SCHEDULE_QUERY,
        variables: { malId, page },
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`AniList request failed for malId ${malId}: ${message}`)
    return null
  }

  if (response.status === 429) {
    console.warn(`AniList rate limited (429) for malId ${malId}`)
    return null
  }

  if (!response.ok) {
    console.warn(
      `AniList request failed (${response.status}) for malId ${malId}`
    )
    return null
  }

  const payload = (await response.json()) as AnilistMediaResponse
  if (payload.errors?.length) {
    console.warn(
      `AniList GraphQL error for malId ${malId}: ${payload.errors[0]?.message ?? 'unknown'}`
    )
    return null
  }
  return payload
}

/**
 * The show's AniList airing schedule (up to 200 episodes), or null when the
 * request fails or AniList has no such show. Failures are logged, not thrown.
 */
export async function fetchAnilistAiring(
  malId: number
): Promise<AnilistAiringResult | null> {
  if (!Number.isFinite(malId) || malId < 1) {
    return null
  }

  const nodes: AnilistAiring[] = []
  let seriesTitle = 'Unknown series'
  for (let page = 1; page <= MAX_AIRING_PAGES; page++) {
    const payload = await fetchAiringPage(malId, page)
    const media = payload?.data?.Media
    if (!media) {
      return null
    }
    if (page === 1) {
      seriesTitle =
        media.title?.english?.trim() ||
        media.title?.romaji?.trim() ||
        seriesTitle
    }
    for (const node of media.airingSchedule?.nodes ?? []) {
      if (node.episode !== undefined && node.airingAt !== undefined) {
        nodes.push({ episode: node.episode, airingAt: node.airingAt })
      }
    }
    if (!media.airingSchedule?.pageInfo?.hasNextPage) {
      break
    }
  }

  return { seriesTitle, nodes }
}

interface AnilistLatestAiredEpisode {
  episodeNumber: number
  seriesTitle: string
}

export async function getLatestAiredEpisode(
  malId: number,
  now: Date = new Date()
): Promise<AnilistLatestAiredEpisode | null> {
  const airing = await fetchAnilistAiring(malId)
  if (!airing) {
    return null
  }

  const nowSeconds = Math.floor(now.getTime() / 1000)
  let latest: AnilistLatestAiredEpisode | null = null
  for (const node of airing.nodes) {
    if (node.airingAt > nowSeconds) {
      continue
    }
    if (!latest || node.episode > latest.episodeNumber) {
      latest = {
        episodeNumber: node.episode,
        seriesTitle: airing.seriesTitle,
      }
    }
  }

  return latest
}
