import type { EpisodeSnapshot } from './types.js'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

interface ShaktiEpisode {
  id?: number
  seq?: number
  title?: string
  availability?: {
    isPlayable?: boolean
    availabilityDate?: string
  }
}

interface ShaktiSeason {
  id?: number
  seq?: number
  title?: string
  episodes?: ShaktiEpisode[]
}

interface ShaktiVideo {
  title?: string
  seasonList?: ShaktiSeason[]
}

let cachedBuildId: string | null = null
let buildIdExpiresAt = 0

export function parseNetflixIdFromUrl(url: string): string {
  const match = String(url).match(/\/title\/(\d+)/i)
  if (!match) {
    throw new Error(`Could not parse Netflix title ID from URL: ${url}`)
  }
  return match[1]
}

function getNetflixCookie(): string {
  const cookie = process.env.NETFLIX_COOKIE?.trim()
  if (!cookie) {
    throw new Error(
      'NETFLIX_COOKIE is not set. Copy your logged-in netflix.com cookie string into GitHub Actions secrets.'
    )
  }
  return cookie
}

async function getShaktiBuildId(cookie: string): Promise<string> {
  const now = Date.now()
  if (cachedBuildId && now < buildIdExpiresAt) {
    return cachedBuildId
  }

  const response = await fetch('https://www.netflix.com/browse', {
    headers: {
      Cookie: cookie,
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
    },
  })

  if (!response.ok) {
    throw new Error(
      `Netflix browse page failed (${response.status}). Cookie may be expired.`
    )
  }

  const html = await response.text()
  const match =
    html.match(/"BUILD_IDENTIFIER":"([^"]+)"/) ??
    html.match(/"buildIdentifier":"([^"]+)"/)

  if (!match) {
    throw new Error('Could not find Netflix Shakti build identifier')
  }

  cachedBuildId = match[1]
  buildIdExpiresAt = now + 6 * 60 * 60 * 1000
  return cachedBuildId
}

function isEpisodeAvailable(episode: ShaktiEpisode, now: Date): boolean {
  if (episode.availability?.isPlayable) {
    return true
  }

  const availabilityDate = episode.availability?.availabilityDate
  if (availabilityDate) {
    const date = new Date(availabilityDate)
    if (!Number.isNaN(date.getTime()) && date <= now) {
      return true
    }
  }

  return false
}

function pickLatestAvailableEpisode(
  seasons: ShaktiSeason[],
  now: Date
): { season: ShaktiSeason; episode: ShaktiEpisode } | null {
  let best: { season: ShaktiSeason; episode: ShaktiEpisode } | null = null

  for (const season of seasons) {
    for (const episode of season.episodes ?? []) {
      if (!isEpisodeAvailable(episode, now)) continue
      if (episode.seq === undefined || episode.id === undefined) continue

      if (
        !best ||
        (episode.seq ?? 0) > (best.episode.seq ?? 0) ||
        ((episode.seq ?? 0) === (best.episode.seq ?? 0) &&
          (episode.id ?? 0) > (best.episode.id ?? 0))
      ) {
        best = { season, episode }
      }
    }
  }

  return best
}

async function fetchTitleMetadata(
  netflixId: string,
  cookie: string
): Promise<ShaktiVideo> {
  const buildId = await getShaktiBuildId(cookie)
  const path = encodeURIComponent(
    JSON.stringify([
      {
        path: 'videos',
        id: Number(netflixId),
        seasonList: {
          from: 0,
          to: 20,
          increment: 1,
          episodeCount: 80,
          jumpTo: null,
        },
        summary: { asInt: null },
        title: 'view',
      },
    ])
  )

  const url = `https://www.netflix.com/api/shakti/${buildId}/pathEvaluator/web/${path}?withSize=true&materialize=true&mfecdn=ttl`

  const response = await fetch(url, {
    headers: {
      Cookie: cookie,
      'User-Agent': USER_AGENT,
      Accept: '*/*',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Netflix Shakti API ${response.status}: ${body.slice(0, 200)}`)
  }

  const data = (await response.json()) as {
    value?: {
      videos?: Record<string, ShaktiVideo>
    }
  }

  const video = data.value?.videos?.[netflixId]
  if (!video) {
    throw new Error(`Netflix title ${netflixId} not found in Shakti response`)
  }

  return video
}

export async function getLatestAvailableEpisodeForTitle(
  netflixId: string,
  cookie = getNetflixCookie()
): Promise<EpisodeSnapshot | null> {
  const video = await fetchTitleMetadata(netflixId, cookie)
  const seasons = video.seasonList ?? []
  const now = new Date()
  const latest = pickLatestAvailableEpisode(seasons, now)

  if (!latest) {
    return null
  }

  const { season, episode } = latest
  const episodeId = String(episode.id)
  const episodeNumber = episode.seq ?? 0
  const seriesTitle = video.title ?? 'Unknown series'
  const seasonTitle = season.title ?? `Season ${season.seq ?? ''}`.trim()

  return {
    provider: 'netflix',
    seriesId: netflixId,
    seriesTitle,
    seasonId: String(season.id ?? season.seq ?? 'unknown'),
    seasonTitle,
    episode: {
      id: episodeId,
      episode: episodeNumber,
      title: episode.title,
      availableAt: episode.availability?.availabilityDate ?? null,
    },
    watchUrl: `https://www.netflix.com/watch/${episodeId}`,
  }
}
