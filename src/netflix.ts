import type { EpisodeSnapshot } from './types.js'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5.2 Safari/605.1.15'

const PATH_EVALUATOR_URL =
  'https://www.netflix.com/nq/website/memberapi/release/pathEvaluator?webp=false&drmSystem=fps&isVolatileBillboardsEnabled=true&isTop10Supported=true&falcor_server=0.1.0&withSize=true&materialize=true&original_path=%2Fshakti%2Fmre%2FpathEvaluator'

type FalcorPath = Array<string | number | Record<string, number>>

interface FalcorAtom<T = unknown> {
  $type?: string
  value?: T
}

interface FalcorRef {
  $type?: string
  value?: [string, string]
}

interface EpisodeSummary {
  type?: string
  id?: number
  idx?: number
  episode?: number
  season?: number
  isPlayable?: boolean
}

interface SeasonSummary {
  id?: number
  name?: string
  length?: number
}

interface Availability {
  isPlayable?: boolean
  availabilityDate?: string
}

interface JsonGraph {
  videos?: Record<
    string,
    {
      title?: FalcorAtom<string>
      summary?: FalcorAtom<EpisodeSummary>
      availability?: FalcorAtom<Availability>
      seasonList?: Record<string, FalcorRef | FalcorAtom>
    }
  >
  seasons?: Record<
    string,
    {
      summary?: FalcorAtom<SeasonSummary>
      episodes?: Record<string, FalcorRef | FalcorAtom>
    }
  >
}

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

function decodeNetflixEscapes(value: string): string {
  return value
    .replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\(.)/g, '$1')
}

function extractAuthURL(html: string): string {
  const match = html.match(
    /"authURL":"((?:\\x[0-9A-Fa-f]{2}|\\u[0-9A-Fa-f]{4}|\\.|[^"\\])*)"/
  )
  if (!match) {
    throw new Error(
      'Could not find Netflix authURL. Cookie may be expired or not logged in.'
    )
  }
  return decodeNetflixEscapes(match[1])
}

async function getAuthURL(cookie: string): Promise<string> {
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

  return extractAuthURL(await response.text())
}

async function pathEvaluate(
  cookie: string,
  authURL: string,
  paths: FalcorPath[]
): Promise<JsonGraph> {
  const body = new URLSearchParams()
  for (const path of paths) {
    body.append('path', JSON.stringify(path))
  }
  body.set('authURL', authURL)

  const response = await fetch(PATH_EVALUATOR_URL, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'User-Agent': USER_AGENT,
      Accept: '*/*',
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: 'https://www.netflix.com',
      Referer: 'https://www.netflix.com/browse',
      'X-Netflix.clientType': 'akira',
      'x-netflix.nq.stack': 'prod',
      'x-netflix.client.request.name': 'ui/falcorUnclassified',
    },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Netflix pathEvaluator API ${response.status}: ${text.slice(0, 200)}`
    )
  }

  const data = (await response.json()) as { jsonGraph?: JsonGraph }
  if (!data.jsonGraph) {
    throw new Error('Netflix pathEvaluator response missing jsonGraph')
  }
  return data.jsonGraph
}

function isRef(node: FalcorRef | FalcorAtom | undefined): node is FalcorRef {
  return node?.$type === 'ref' && Array.isArray(node.value)
}

function atomValue<T>(node: FalcorAtom<T> | undefined): T | undefined {
  if (!node || node.$type === 'error') return undefined
  return node.value
}

function seasonIdsFromGraph(
  graph: JsonGraph,
  netflixId: string
): Array<{ seasonId: string; summary?: SeasonSummary }> {
  const seasonList = graph.videos?.[netflixId]?.seasonList ?? {}
  const seasons: Array<{ seasonId: string; summary?: SeasonSummary }> = []

  for (const key of Object.keys(seasonList).sort(
    (a, b) => Number(a) - Number(b)
  )) {
    const node = seasonList[key]
    if (!isRef(node) || node.value?.[0] !== 'seasons') continue
    const seasonId = String(node.value[1])
    seasons.push({
      seasonId,
      summary: atomValue(graph.seasons?.[seasonId]?.summary),
    })
  }

  return seasons
}

function isEpisodePlayable(
  summary: EpisodeSummary | undefined,
  availability: Availability | undefined
): boolean {
  if (availability?.isPlayable === false) return false
  if (availability?.isPlayable === true) return true
  return Boolean(summary?.isPlayable)
}

export async function getLatestAvailableEpisodeForTitle(
  netflixId: string,
  cookie = getNetflixCookie()
): Promise<EpisodeSnapshot | null> {
  const authURL = await getAuthURL(cookie)
  const titleId = Number(netflixId)

  const baseGraph = await pathEvaluate(cookie, authURL, [
    ['videos', titleId, 'title'],
    ['videos', titleId, 'seasonList', { from: 0, to: 20 }, 'summary'],
  ])

  const seriesTitle =
    atomValue(baseGraph.videos?.[netflixId]?.title) ?? 'Unknown series'
  const seasons = seasonIdsFromGraph(baseGraph, netflixId)
  if (seasons.length === 0) {
    return null
  }

  const episodePaths: FalcorPath[] = []
  for (const season of seasons) {
    const length = Math.max(0, (season.summary?.length ?? 80) - 1)
    const seasonKey = Number(season.seasonId)
    episodePaths.push(
      ['seasons', seasonKey, 'episodes', { from: 0, to: length }, 'summary'],
      ['seasons', seasonKey, 'episodes', { from: 0, to: length }, 'title'],
      [
        'seasons',
        seasonKey,
        'episodes',
        { from: 0, to: length },
        'availability',
      ]
    )
  }

  const episodeGraph = await pathEvaluate(cookie, authURL, episodePaths)

  let best: {
    seasonId: string
    seasonTitle: string
    episodeId: string
    episodeNumber: number
    title?: string
    availableAt: string | null
  } | null = null

  for (const season of seasons) {
    const episodeNodes = episodeGraph.seasons?.[season.seasonId]?.episodes ?? {}
    const seasonTitle =
      season.summary?.name ?? `Season ${season.summary?.id ?? season.seasonId}`

    for (const key of Object.keys(episodeNodes)) {
      const node = episodeNodes[key]
      if (!isRef(node) || node.value?.[0] !== 'videos') continue

      const episodeId = String(node.value[1])
      const video = episodeGraph.videos?.[episodeId]
      const summary = atomValue(video?.summary)
      const availability = atomValue(video?.availability)
      if (!isEpisodePlayable(summary, availability)) continue

      const episodeNumber = summary?.episode ?? summary?.idx ?? Number(key) + 1
      if (!Number.isFinite(episodeNumber)) continue

      if (!best || episodeNumber > best.episodeNumber) {
        best = {
          seasonId: season.seasonId,
          seasonTitle,
          episodeId,
          episodeNumber,
          title: atomValue(video?.title),
          availableAt: availability?.availabilityDate ?? null,
        }
      }
    }
  }

  if (!best) {
    return null
  }

  return {
    provider: 'netflix',
    seriesId: netflixId,
    seriesTitle,
    seasonId: best.seasonId,
    seasonTitle: best.seasonTitle,
    episode: {
      id: best.episodeId,
      episode: best.episodeNumber,
      title: best.title,
      availableAt: best.availableAt,
    },
    watchUrl: `https://www.netflix.com/watch/${best.episodeId}`,
  }
}
