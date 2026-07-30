export interface MalProgress {
  watched: number
  total: number | null
}

export interface MalAnimeDetails {
  watched: number
  total: number | null
  meanScore: number | null
  coverUrl: string | null
}

export interface MalPlanToWatchEntry {
  malId: number
  title: string
  status: string
  startDate: string | null
  broadcast: {
    dayOfWeek: string | null
    startTime: string | null
  } | null
  coverUrl: string | null
  numEpisodes: number | null
}

export type MalPlanToWatchResult =
  | { status: 'ok'; entries: MalPlanToWatchEntry[] }
  | { status: 'not_configured' }
  | { status: 'unavailable' }

export type MalFetchResult =
  | { status: 'ok'; progress: MalProgress }
  | { status: 'not_configured' }
  | { status: 'unavailable' }

export type MalFetchDetailsResult =
  | { status: 'ok'; details: MalAnimeDetails }
  | { status: 'not_configured' }
  | { status: 'unavailable' }

interface MalTokenResponse {
  access_token: string
}

interface MalListStatus {
  num_episodes_watched?: number
}

interface MalMainPicture {
  medium?: string
  large?: string
}

interface MalAnimeResponse {
  num_episodes?: number
  mean?: number
  main_picture?: MalMainPicture
  my_list_status?: MalListStatus
}

interface MalAnimelistNode {
  id: number
  title: string
  status?: string
  start_date?: string
  num_episodes?: number
  main_picture?: MalMainPicture
  broadcast?: {
    day_of_the_week?: string
    start_time?: string
  }
}

interface MalAnimelistEntry {
  node: MalAnimelistNode
}

interface MalAnimelistResponse {
  data?: MalAnimelistEntry[]
  paging?: {
    next?: string
  }
}

const MAL_ANIME_FIELDS =
  'num_episodes,my_list_status,mean,main_picture'

const MAL_ANIMELIST_FIELDS =
  'list_status,num_episodes,start_date,broadcast,main_picture,status'

let cachedAccessToken: string | null | undefined
const detailsCache = new Map<number, MalFetchDetailsResult>()
let configMissingLogged = false
let authFailedLogged = false

function getMalConfig() {
  const clientId = process.env.MAL_CLIENT_ID?.trim()
  const clientSecret = process.env.MAL_CLIENT_SECRET?.trim()
  const refreshToken = process.env.MAL_REFRESH_TOKEN?.trim()

  if (!clientId || !clientSecret || !refreshToken) {
    return null
  }

  return { clientId, clientSecret, refreshToken }
}

async function refreshMalAccessToken(): Promise<string | null> {
  const config = getMalConfig()
  if (!config) return null

  const response = await fetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    if (!authFailedLogged) {
      console.warn(
        `MAL token refresh failed (${response.status}). Reconnect at /mal and update MAL_REFRESH_TOKEN.`
      )
      authFailedLogged = true
    }
    return null
  }

  const data = (await response.json()) as MalTokenResponse
  return data.access_token
}

async function getCachedMalAccessToken(): Promise<string | null> {
  if (cachedAccessToken !== undefined) {
    return cachedAccessToken
  }

  cachedAccessToken = await refreshMalAccessToken()
  return cachedAccessToken
}

export function isMalConfigured(): boolean {
  return getMalConfig() !== null
}

function parseMalAnimeDetails(data: MalAnimeResponse): MalAnimeDetails {
  const watched = data.my_list_status?.num_episodes_watched ?? 0
  const total =
    typeof data.num_episodes === 'number' && data.num_episodes > 0
      ? data.num_episodes
      : null
  const meanScore =
    typeof data.mean === 'number' && Number.isFinite(data.mean) ? data.mean : null
  const coverUrl =
    data.main_picture?.large ??
    data.main_picture?.medium ??
    null

  return { watched, total, meanScore, coverUrl }
}

async function fetchMalAnimeResponse(
  malId: number,
  accessToken: string
): Promise<MalAnimeResponse | null> {
  const response = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}?fields=${MAL_ANIME_FIELDS}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    console.warn(`MAL anime lookup failed (${response.status}) for id ${malId}`)
    return null
  }

  return (await response.json()) as MalAnimeResponse
}

function notConfiguredDetailsResult(): MalFetchDetailsResult {
  if (!configMissingLogged) {
    console.warn(
      'MAL not configured for dashboard progress. Set MAL_CLIENT_ID, MAL_CLIENT_SECRET, and MAL_REFRESH_TOKEN on GitHub Actions.'
    )
    configMissingLogged = true
  }
  return { status: 'not_configured' }
}

export async function fetchMalAnimeDetails(
  malId: number
): Promise<MalFetchDetailsResult> {
  const cached = detailsCache.get(malId)
  if (cached) {
    return cached
  }

  if (!isMalConfigured()) {
    const result = notConfiguredDetailsResult()
    detailsCache.set(malId, result)
    return result
  }

  const accessToken = await getCachedMalAccessToken()
  if (!accessToken) {
    const result: MalFetchDetailsResult = { status: 'unavailable' }
    detailsCache.set(malId, result)
    return result
  }

  const data = await fetchMalAnimeResponse(malId, accessToken)
  if (!data) {
    const result: MalFetchDetailsResult = { status: 'unavailable' }
    detailsCache.set(malId, result)
    return result
  }

  const result: MalFetchDetailsResult = {
    status: 'ok',
    details: parseMalAnimeDetails(data),
  }
  detailsCache.set(malId, result)
  return result
}

export async function fetchMalProgress(malId: number): Promise<MalFetchResult> {
  const details = await fetchMalAnimeDetails(malId)
  if (details.status === 'ok') {
    const { watched, total } = details.details
    return { status: 'ok', progress: { watched, total } }
  }
  return details
}

export function formatMalProgressLabel(result: MalFetchResult): string {
  if (result.status === 'ok') {
    const { watched, total } = result.progress
    if (total) {
      return `${watched} / ${total}`
    }
    return `${watched} watched`
  }

  if (result.status === 'not_configured') {
    return 'MAL not configured'
  }

  return 'MAL unavailable'
}

function parsePlanToWatchEntry(node: MalAnimelistNode): MalPlanToWatchEntry {
  const broadcast = node.broadcast
    ? {
        dayOfWeek: node.broadcast.day_of_the_week ?? null,
        startTime: node.broadcast.start_time ?? null,
      }
    : null

  return {
    malId: node.id,
    title: node.title,
    status: node.status ?? '',
    startDate: node.start_date ?? null,
    broadcast,
    coverUrl:
      node.main_picture?.large ?? node.main_picture?.medium ?? null,
    numEpisodes:
      typeof node.num_episodes === 'number' && node.num_episodes > 0
        ? node.num_episodes
        : null,
  }
}

async function fetchPlanToWatchPage(
  accessToken: string,
  url?: string
): Promise<MalAnimelistResponse | null> {
  const requestUrl =
    url ??
    `https://api.myanimelist.net/v2/users/@me/animelist?status=plan_to_watch&limit=100&fields=${MAL_ANIMELIST_FIELDS}`

  const response = await fetch(requestUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    console.warn(`MAL plan-to-watch lookup failed (${response.status})`)
    return null
  }

  return (await response.json()) as MalAnimelistResponse
}

export async function fetchPlanToWatchAnime(): Promise<MalPlanToWatchResult> {
  if (!isMalConfigured()) {
    return { status: 'not_configured' }
  }

  const accessToken = await getCachedMalAccessToken()
  if (!accessToken) {
    return { status: 'unavailable' }
  }

  const entries: MalPlanToWatchEntry[] = []
  let nextUrl: string | undefined

  do {
    const page = await fetchPlanToWatchPage(accessToken, nextUrl)
    if (!page) {
      return entries.length > 0
        ? { status: 'ok', entries }
        : { status: 'unavailable' }
    }

    for (const item of page.data ?? []) {
      if (item.node?.id) {
        entries.push(parsePlanToWatchEntry(item.node))
      }
    }

    nextUrl = page.paging?.next
  } while (nextUrl)

  return { status: 'ok', entries }
}
