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
  titleEnglish?: string
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
  alternative_titles?: {
    en?: string
    ja?: string
    synonyms?: string[]
  }
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

const MAL_ANIME_FIELDS = 'num_episodes,my_list_status,mean,main_picture'

const MAL_ANIMELIST_FIELDS =
  'list_status,num_episodes,start_date,broadcast,main_picture,status,alternative_titles'

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

function isMalConfigured(): boolean {
  return getMalConfig() !== null
}

function parseMalAnimeDetails(data: MalAnimeResponse): MalAnimeDetails {
  const watched = data.my_list_status?.num_episodes_watched ?? 0
  const total =
    typeof data.num_episodes === 'number' && data.num_episodes > 0
      ? data.num_episodes
      : null
  const meanScore =
    typeof data.mean === 'number' && Number.isFinite(data.mean)
      ? data.mean
      : null
  const coverUrl = data.main_picture?.large ?? data.main_picture?.medium ?? null

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

  const titleEnglish = node.alternative_titles?.en?.trim() || undefined

  return {
    malId: node.id,
    title: node.title,
    titleEnglish,
    status: node.status ?? '',
    startDate: node.start_date ?? null,
    broadcast,
    coverUrl: node.main_picture?.large ?? node.main_picture?.medium ?? null,
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
    `https://api.myanimelist.net/v2/users/@me/animelist?status=plan_to_watch&limit=1000&nsfw=true&fields=${MAL_ANIMELIST_FIELDS}`

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

export interface MalListEntry {
  malId: number
  title: string
}

export interface MalRelatedAnime {
  malId: number
  title: string
  relationType: string
  relationTypeFormatted: string
  coverUrl: string | null
}

export interface MalAnimeSummary {
  mediaType: string | null
  status: string | null
  startDate: string | null
  numEpisodes: number | null
  coverUrl: string | null
}

export type MalListResult =
  | { status: 'ok'; entries: MalListEntry[] }
  | { status: 'not_configured' }
  | { status: 'unavailable' }
  | { status: 'rate_limited'; httpStatus: number }

export type MalRelatedAnimeResult =
  | { status: 'ok'; related: MalRelatedAnime[] }
  | { status: 'not_configured' }
  | { status: 'unavailable' }
  | { status: 'rate_limited'; httpStatus: number }

interface MalRelatedAnimeResponse {
  related_anime?: Array<{
    node: { id: number; title: string; main_picture?: MalMainPicture }
    relation_type?: string
    relation_type_formatted?: string
  }>
}

interface MalAnimeSummaryResponse {
  media_type?: string
  status?: string
  start_date?: string
  num_episodes?: number
  main_picture?: MalMainPicture
}

// MAL answers throttling with 429, and sometimes a bare 403.
function isMalRateLimitStatus(status: number): boolean {
  return status === 429 || status === 403
}

/**
 * Fetches the full user list (optionally one status) with no partial results:
 * callers diff against it, so a truncated list would cause false positives.
 */
export async function fetchUserAnimeList(
  status?: string
): Promise<MalListResult> {
  if (!isMalConfigured()) {
    return { status: 'not_configured' }
  }

  const accessToken = await getCachedMalAccessToken()
  if (!accessToken) {
    return { status: 'unavailable' }
  }

  const params = new URLSearchParams({ limit: '1000', nsfw: 'true' })
  if (status) {
    params.set('status', status)
  }

  const entries: MalListEntry[] = []
  let nextUrl: string | undefined =
    `https://api.myanimelist.net/v2/users/@me/animelist?${params}`

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      console.warn(
        `MAL ${status ?? 'full'} list lookup failed (${response.status})`
      )
      return isMalRateLimitStatus(response.status)
        ? { status: 'rate_limited', httpStatus: response.status }
        : { status: 'unavailable' }
    }

    const page = (await response.json()) as MalAnimelistResponse
    for (const item of page.data ?? []) {
      if (item.node?.id) {
        entries.push({ malId: item.node.id, title: item.node.title })
      }
    }

    nextUrl = page.paging?.next
  }

  return { status: 'ok', entries }
}

export async function fetchRelatedAnime(
  malId: number
): Promise<MalRelatedAnimeResult> {
  if (!isMalConfigured()) {
    return { status: 'not_configured' }
  }

  const accessToken = await getCachedMalAccessToken()
  if (!accessToken) {
    return { status: 'unavailable' }
  }

  const response = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}?fields=related_anime`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!response.ok) {
    console.warn(
      `MAL related anime lookup failed (${response.status}) for id ${malId}`
    )
    return isMalRateLimitStatus(response.status)
      ? { status: 'rate_limited', httpStatus: response.status }
      : { status: 'unavailable' }
  }

  const data = (await response.json()) as MalRelatedAnimeResponse
  const related = (data.related_anime ?? [])
    .filter((item) => item.node?.id)
    .map((item) => ({
      malId: item.node.id,
      title: item.node.title,
      relationType: item.relation_type ?? 'other',
      relationTypeFormatted: item.relation_type_formatted ?? 'Related',
      coverUrl:
        item.node.main_picture?.large ?? item.node.main_picture?.medium ?? null,
    }))

  return { status: 'ok', related }
}

export type MalHealth = 'up' | 'down' | 'not_configured'

const MAL_PROBE_URL = 'https://api.myanimelist.net/v2/anime/1?fields=id'
const MAL_PROBE_ATTEMPTS = 2
const MAL_PROBE_RETRY_DELAY_MS = 3000
const MAL_PROBE_TIMEOUT_MS = 10000

/**
 * Checks whether the MAL API is reachable. Uses the client ID header rather
 * than OAuth so an expired refresh token isn't reported as an outage. Only
 * network errors, timeouts, and 5xx count as down; 4xx means MAL answered.
 */
export async function probeMalHealth(): Promise<MalHealth> {
  const clientId = process.env.MAL_CLIENT_ID?.trim()
  if (!clientId) {
    return 'not_configured'
  }

  for (let attempt = 1; attempt <= MAL_PROBE_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(MAL_PROBE_URL, {
        headers: { 'X-MAL-CLIENT-ID': clientId },
        signal: AbortSignal.timeout(MAL_PROBE_TIMEOUT_MS),
      })
      if (response.status < 500) {
        return 'up'
      }
      console.warn(`MAL health probe got HTTP ${response.status}`)
    } catch (error) {
      console.warn(
        `MAL health probe failed: ${error instanceof Error ? error.message : error}`
      )
    }

    if (attempt < MAL_PROBE_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, MAL_PROBE_RETRY_DELAY_MS))
    }
  }

  return 'down'
}

export async function fetchMalAnimeSummary(
  malId: number
): Promise<MalAnimeSummary | null> {
  const accessToken = isMalConfigured() ? await getCachedMalAccessToken() : null
  if (!accessToken) {
    return null
  }

  const response = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}?fields=media_type,status,start_date,num_episodes,main_picture`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  if (!response.ok) {
    console.warn(
      `MAL anime summary failed (${response.status}) for id ${malId}`
    )
    return null
  }

  const data = (await response.json()) as MalAnimeSummaryResponse
  return {
    mediaType: data.media_type ?? null,
    status: data.status ?? null,
    startDate: data.start_date ?? null,
    numEpisodes:
      typeof data.num_episodes === 'number' && data.num_episodes > 0
        ? data.num_episodes
        : null,
    coverUrl: data.main_picture?.large ?? data.main_picture?.medium ?? null,
  }
}
