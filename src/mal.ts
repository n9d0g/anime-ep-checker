import { sleep } from './sleep.ts'
import {
  parsePlanToWatchPage,
  PLAN_TO_WATCH_LIST_FIELDS,
  type MalPlanToWatchNode,
  type MalPlanToWatchPage,
} from '../shared/mal-plan-to-watch.ts'
import { pickMalCoverUrl, type MalMainPicture } from '../shared/mal-cover.ts'
import type { PlanToWatchSnapshotEntry } from '../shared/types.ts'

interface MalProgress {
  watched: number
  total: number | null
}

export interface MalAnimeDetails {
  watched: number
  total: number | null
  meanScore: number | null
  coverUrl: string | null
}

export type MalPlanToWatchEntry = PlanToWatchSnapshotEntry

export type MalPlanToWatchResult =
  | { status: 'ok'; entries: MalPlanToWatchEntry[] }
  | { status: 'not_configured' }
  | { status: 'unavailable' }

type MalFetchResult =
  | { status: 'ok'; progress: MalProgress }
  | { status: 'not_configured' }
  | { status: 'unavailable' }

type MalFetchDetailsResult =
  | { status: 'ok'; details: MalAnimeDetails }
  | { status: 'not_configured' }
  | { status: 'unavailable' }

interface MalTokenResponse {
  access_token: string
}

interface MalListStatus {
  num_episodes_watched?: number
}

interface MalAnimeResponse {
  num_episodes?: number
  mean?: number
  main_picture?: MalMainPicture
  my_list_status?: MalListStatus
}

type MalAnimelistResponse = MalPlanToWatchPage<MalPlanToWatchNode>

const MAL_API = 'https://api.myanimelist.net/v2'
const MAL_ANIME_FIELDS = 'num_episodes,my_list_status,mean,main_picture'

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
  const coverUrl = pickMalCoverUrl(data.main_picture)

  return { watched, total, meanScore, coverUrl }
}

type MalGetResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'not_configured' }
  | { status: 'unavailable' }
  | { status: 'rate_limited'; httpStatus: number }

// MAL answers throttling with 429, and sometimes a bare 403.
function isMalRateLimitStatus(status: number): boolean {
  return status === 429 || status === 403
}

/**
 * Authenticated GET against the MAL API. Every failed response is logged as
 * `MAL <label> failed (<status>)[ for id <malId>]`; 429 and 403 come back as
 * `rate_limited`, anything else as `unavailable`.
 */
async function malGet<T>(
  url: string,
  label: string,
  malId?: number
): Promise<MalGetResult<T>> {
  if (!isMalConfigured()) {
    return { status: 'not_configured' }
  }

  const accessToken = await getCachedMalAccessToken()
  if (!accessToken) {
    return { status: 'unavailable' }
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    console.warn(
      `MAL ${label} failed (${response.status})${malId === undefined ? '' : ` for id ${malId}`}`
    )
    return isMalRateLimitStatus(response.status)
      ? { status: 'rate_limited', httpStatus: response.status }
      : { status: 'unavailable' }
  }

  return { status: 'ok', data: (await response.json()) as T }
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

  const response = await malGet<MalAnimeResponse>(
    `${MAL_API}/anime/${malId}?fields=${MAL_ANIME_FIELDS}`,
    'anime lookup',
    malId
  )
  const result: MalFetchDetailsResult =
    response.status === 'ok'
      ? { status: 'ok', details: parseMalAnimeDetails(response.data) }
      : response.status === 'not_configured'
        ? notConfiguredDetailsResult()
        : { status: 'unavailable' }

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

export async function fetchPlanToWatchAnime(): Promise<MalPlanToWatchResult> {
  const entries: MalPlanToWatchEntry[] = []
  let nextUrl: string | undefined =
    `${MAL_API}/users/@me/animelist?status=plan_to_watch&limit=1000&nsfw=true&fields=${PLAN_TO_WATCH_LIST_FIELDS.join(',')}`

  while (nextUrl) {
    const page: MalGetResult<MalAnimelistResponse> = await malGet(
      nextUrl,
      'plan-to-watch lookup'
    )
    if (page.status === 'not_configured') {
      return { status: 'not_configured' }
    }
    if (page.status !== 'ok') {
      return entries.length > 0
        ? { status: 'ok', entries }
        : { status: 'unavailable' }
    }

    entries.push(...parsePlanToWatchPage(page.data))
    nextUrl = page.data.paging?.next
  }

  return { status: 'ok', entries }
}

interface MalListEntry {
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

type MalListResult =
  | { status: 'ok'; entries: MalListEntry[] }
  | { status: 'not_configured' }
  | { status: 'unavailable' }
  | { status: 'rate_limited'; httpStatus: number }

type MalRelatedAnimeResult =
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

/**
 * Fetches the full user list (optionally one status) with no partial results:
 * callers diff against it, so a truncated list would cause false positives.
 */
export async function fetchUserAnimeList(
  status?: string
): Promise<MalListResult> {
  const params = new URLSearchParams({ limit: '1000', nsfw: 'true' })
  if (status) {
    params.set('status', status)
  }

  const entries: MalListEntry[] = []
  let nextUrl: string | undefined = `${MAL_API}/users/@me/animelist?${params}`

  while (nextUrl) {
    const page: MalGetResult<MalAnimelistResponse> = await malGet(
      nextUrl,
      `${status ?? 'full'} list lookup`
    )
    if (page.status !== 'ok') {
      return page
    }

    for (const item of page.data.data ?? []) {
      if (item.node?.id) {
        entries.push({ malId: item.node.id, title: item.node.title })
      }
    }

    nextUrl = page.data.paging?.next
  }

  return { status: 'ok', entries }
}

export async function fetchRelatedAnime(
  malId: number
): Promise<MalRelatedAnimeResult> {
  const response = await malGet<MalRelatedAnimeResponse>(
    `${MAL_API}/anime/${malId}?fields=related_anime`,
    'related anime lookup',
    malId
  )
  if (response.status !== 'ok') {
    return response
  }

  const related = (response.data.related_anime ?? [])
    .filter((item) => item.node?.id)
    .map((item) => ({
      malId: item.node.id,
      title: item.node.title,
      relationType: item.relation_type ?? 'other',
      relationTypeFormatted: item.relation_type_formatted ?? 'Related',
      coverUrl: pickMalCoverUrl(item.node.main_picture),
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
      await sleep(MAL_PROBE_RETRY_DELAY_MS)
    }
  }

  return 'down'
}

export async function fetchMalAnimeSummary(
  malId: number
): Promise<MalAnimeSummary | null> {
  const response = await malGet<MalAnimeSummaryResponse>(
    `${MAL_API}/anime/${malId}?fields=media_type,status,start_date,num_episodes,main_picture`,
    'anime summary',
    malId
  )
  if (response.status !== 'ok') {
    return null
  }

  const data = response.data
  return {
    mediaType: data.media_type ?? null,
    status: data.status ?? null,
    startDate: data.start_date ?? null,
    numEpisodes:
      typeof data.num_episodes === 'number' && data.num_episodes > 0
        ? data.num_episodes
        : null,
    coverUrl: pickMalCoverUrl(data.main_picture),
  }
}
