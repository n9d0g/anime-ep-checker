// AniList artwork and studios for the admin's rows and sheets, looked up by
// MAL ID (no API key). One request covers up to 50 shows.
const ANILIST_URL = 'https://graphql.anilist.co'

export const ANILIST_BATCH_SIZE = 50
const MAX_RATE_LIMIT_RETRIES = 2
const MAX_RETRY_WAIT_MS = 10_000

const MEDIA_BY_MAL_IDS_QUERY = `
query ($ids: [Int], $perPage: Int) {
  Page(perPage: $perPage) {
    media(idMal_in: $ids, type: ANIME) {
      idMal
      bannerImage
      coverImage {
        large
      }
      studios {
        edges {
          isMain
          node {
            name
          }
        }
      }
    }
  }
}
`

interface AniListMediaNode {
  idMal?: number | null
  bannerImage?: string | null
  coverImage?: { large?: string | null } | null
  studios?: {
    edges?: Array<{
      isMain?: boolean | null
      node?: { name?: string | null } | null
    } | null> | null
  } | null
}

interface AniListPageResponse {
  data?: { Page?: { media?: Array<AniListMediaNode | null> | null } | null }
  errors?: Array<{ message?: string }>
}

/** What a row and sheet use from AniList for one show. */
export interface AniListMedia {
  /** The wide banner, often missing for shows that haven't aired. */
  bannerUrl: string | null
  coverUrl: string | null
  /** Studios AniList doesn't mark as main: the producers. */
  producers: string[]
}

function toMedia(node: AniListMediaNode): AniListMedia {
  return {
    bannerUrl: node.bannerImage || null,
    coverUrl: node.coverImage?.large || null,
    producers: (node.studios?.edges ?? [])
      .filter((edge) => edge && !edge.isMain && edge.node?.name)
      .map((edge) => edge!.node!.name!),
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** One page of up to 50 shows, waiting out a rate limit a couple of times. */
async function fetchBatch(
  malIds: number[]
): Promise<Record<number, AniListMedia>> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: MEDIA_BY_MAL_IDS_QUERY,
        variables: { ids: malIds, perPage: ANILIST_BATCH_SIZE },
      }),
    })

    if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after'))
      await sleep(
        Math.min(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 1000,
          MAX_RETRY_WAIT_MS
        )
      )
      continue
    }
    if (!response.ok) {
      throw new Error(`AniList lookup failed (${response.status})`)
    }

    const body = (await response.json()) as AniListPageResponse
    if (body.errors?.length) {
      throw new Error(
        `AniList lookup failed: ${body.errors[0]?.message ?? 'unknown error'}`
      )
    }
    const result: Record<number, AniListMedia> = {}
    for (const node of body.data?.Page?.media ?? []) {
      if (node?.idMal) {
        result[node.idMal] = toMedia(node)
      }
    }
    return result
  }
}

/**
 * AniList media for each MAL ID it knows, in ⌈n/50⌉ requests. A batch that
 * fails is left out rather than failing the rest; shows AniList doesn't list
 * are simply missing from the result.
 */
export async function fetchAniListMedia(
  malIds: number[]
): Promise<Record<number, AniListMedia>> {
  const unique = [
    ...new Set(malIds.filter((id) => Number.isInteger(id) && id > 0)),
  ]
  const result: Record<number, AniListMedia> = {}
  for (let start = 0; start < unique.length; start += ANILIST_BATCH_SIZE) {
    try {
      Object.assign(
        result,
        await fetchBatch(unique.slice(start, start + ANILIST_BATCH_SIZE))
      )
    } catch (error) {
      console.warn('AniList batch skipped:', error)
    }
  }
  return result
}
