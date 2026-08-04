const ANILIST_URL = 'https://graphql.anilist.co'

const AIRING_SCHEDULE_QUERY = `
query ($malId: Int) {
  Media(idMal: $malId, type: ANIME) {
    title {
      romaji
      english
    }
    airingSchedule(perPage: 50) {
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
        nodes?: AnilistAiringNode[] | null
      } | null
    } | null
  }
  errors?: Array<{ message?: string }>
}

export interface AnilistLatestAiredEpisode {
  episodeNumber: number
  seriesTitle: string
}

export async function getLatestAiredEpisode(
  malId: number,
  now: Date = new Date()
): Promise<AnilistLatestAiredEpisode | null> {
  if (!Number.isFinite(malId) || malId < 1) {
    return null
  }

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
        variables: { malId },
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
    console.warn(`AniList request failed (${response.status}) for malId ${malId}`)
    return null
  }

  const payload = (await response.json()) as AnilistMediaResponse
  if (payload.errors?.length) {
    console.warn(
      `AniList GraphQL error for malId ${malId}: ${payload.errors[0]?.message ?? 'unknown'}`
    )
    return null
  }

  const media = payload.data?.Media
  if (!media) {
    return null
  }

  const nodes = media.airingSchedule?.nodes ?? []
  const nowSeconds = Math.floor(now.getTime() / 1000)
  let latest: AnilistLatestAiredEpisode | null = null

  for (const node of nodes) {
    const episodeNumber = node.episode
    const airingAt = node.airingAt
    if (
      episodeNumber === undefined ||
      airingAt === undefined ||
      airingAt > nowSeconds
    ) {
      continue
    }

    if (!latest || episodeNumber > latest.episodeNumber) {
      latest = {
        episodeNumber,
        seriesTitle:
          media.title?.english?.trim() ||
          media.title?.romaji?.trim() ||
          'Unknown series',
      }
    }
  }

  return latest
}
