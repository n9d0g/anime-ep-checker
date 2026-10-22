import type { MalBroadcast } from './broadcast'
import type { PtwDetails, WatchedEntry } from './types'

interface MalTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

interface MalListStatus {
  status?: string
  num_episodes_watched?: number
}

interface MalMainPicture {
  medium?: string
  large?: string
}

interface MalAnimeResponse {
  title?: string
  alternative_titles?: {
    en?: string
    ja?: string
    synonyms?: string[]
  }
  num_episodes?: number
  broadcast?: { day_of_the_week?: string; start_time?: string }
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

interface MalCompletedNode {
  id: number
  title: string
  alternative_titles?: { en?: string }
  main_picture?: MalMainPicture
  media_type?: string
  num_episodes?: number
  average_episode_duration?: number
  start_season?: { year?: number; season?: string }
  mean?: number
  genres?: Array<{ name?: string }>
  studios?: Array<{ name?: string }>
}

interface MalCompletedListStatus {
  score?: number
  start_date?: string
  finish_date?: string
  updated_at?: string
  num_times_rewatched?: number
}

interface MalCompletedItem {
  node: MalCompletedNode
  list_status?: MalCompletedListStatus
}

interface MalPtwDetailsNode extends MalCompletedNode {
  synopsis?: string
  rank?: number
  popularity?: number
  num_list_users?: number
  start_date?: string
  end_date?: string
  broadcast?: { day_of_the_week?: string; start_time?: string }
  source?: string
  rating?: string
}

interface MalPtwDetailsItem {
  node: MalPtwDetailsNode
  list_status?: { updated_at?: string }
}

/** One page of a paged MAL list response. */
interface MalPage<T> {
  data?: T[]
  paging?: { next?: string }
}

interface MalSearchNode {
  id: number
  title: string
  alternative_titles?: {
    en?: string
    ja?: string
    synonyms?: string[]
  }
}

interface MalSearchResponse {
  data?: Array<{ node: MalSearchNode }>
}

const MAL_ANIME_FIELDS = 'title,num_episodes,my_list_status,mean,main_picture'

const MAL_COMPLETED_FIELDS = [
  'list_status{score,start_date,finish_date,updated_at,num_times_rewatched}',
  'alternative_titles',
  'main_picture',
  'media_type',
  'num_episodes',
  'average_episode_duration',
  'start_season',
  'mean',
  'genres',
  'studios',
].join(',')

const MAL_PTW_DETAILS_FIELDS = [
  'list_status{updated_at}',
  'synopsis',
  'main_picture',
  'mean',
  'rank',
  'popularity',
  'num_list_users',
  'media_type',
  'num_episodes',
  'average_episode_duration',
  'start_season',
  'start_date',
  'end_date',
  'broadcast',
  'source',
  'rating',
  'genres',
  'studios',
].join(',')

const MAL_ANIMELIST_FIELDS =
  'list_status,num_episodes,start_date,broadcast,main_picture,status,alternative_titles'

interface MalPlanToWatchEntry {
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

type MalPlanToWatchResult =
  | { status: 'ok'; entries: MalPlanToWatchEntry[] }
  | { status: 'not_configured' }
  | { status: 'unavailable' }

interface MalAnimeDetails {
  watched: number
  total: number | null
  meanScore: number | null
  coverUrl: string | null
}

/** MAL credentials are missing from the environment. */
export class MalConfigError extends Error {}

/** MAL answered a request with a non-2xx status. */
export class MalHttpError extends Error {
  constructor(
    lookup: string,
    readonly status: number,
    body: string
  ) {
    super(`${lookup} failed (${status}): ${body}`)
  }
}

/** Parses a MAL response, throwing a MalHttpError named after `lookup` when it failed. */
async function readMalJson<T>(response: Response, lookup: string): Promise<T> {
  if (!response.ok) {
    throw new MalHttpError(lookup, response.status, await response.text())
  }
  return (await response.json()) as T
}

function malGet<T>(accessToken: string, url: string, lookup: string) {
  return fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then((response) => readMalJson<T>(response, lookup))
}

function getMalClientConfig() {
  const clientId = process.env.MAL_CLIENT_ID?.trim()
  const clientSecret = process.env.MAL_CLIENT_SECRET?.trim()

  if (!clientId || !clientSecret) {
    throw new MalConfigError(
      'MAL_CLIENT_ID and MAL_CLIENT_SECRET must be set on Cloudflare.'
    )
  }

  return { clientId, clientSecret }
}

function getMalRefreshConfig() {
  const { clientId, clientSecret } = getMalClientConfig()
  const refreshToken = process.env.MAL_REFRESH_TOKEN?.trim()

  if (!refreshToken) {
    throw new MalConfigError(
      'MAL_REFRESH_TOKEN is not set. Connect MAL from /mal and paste the refresh token into Cloudflare Worker secrets.'
    )
  }

  return { clientId, clientSecret, refreshToken }
}

export function getMalRedirectUri(requestUrl: string): string {
  const configured = process.env.MAL_REDIRECT_URI?.trim()
  if (configured) return configured
  return new URL('/api/mal/callback', requestUrl).toString()
}

export async function exchangeMalCode(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<MalTokenResponse> {
  const { clientId, clientSecret } = getMalClientConfig()

  const response = await fetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
    }),
  })

  return readMalJson<MalTokenResponse>(response, 'MAL token exchange')
}

/**
 * True when an error from this module means MAL itself is down: the request
 * never got a response, MAL answered 5xx, or it served a non-JSON (maintenance)
 * page. 4xx errors mean MAL is up and rejected the request.
 */
export function isMalOutageError(error: unknown): boolean {
  if (error instanceof TypeError || error instanceof SyntaxError) {
    return true
  }
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return true
  }
  return (
    error instanceof MalHttpError && error.status >= 500 && error.status < 600
  )
}

let cachedMalAccessToken: string | null = null
let malAccessTokenExpiresAt = 0

async function getMalAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedMalAccessToken && malAccessTokenExpiresAt > now + 60_000) {
    return cachedMalAccessToken
  }

  const { clientId, clientSecret, refreshToken } = getMalRefreshConfig()

  const response = await fetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await readMalJson<MalTokenResponse>(
    response,
    'MAL token refresh'
  )
  cachedMalAccessToken = data.access_token
  malAccessTokenExpiresAt = now + (data.expires_in ?? 3600) * 1000
  return cachedMalAccessToken
}

async function fetchMalAnime(
  accessToken: string,
  malId: number
): Promise<MalAnimeDetails> {
  const current = await malGet<MalAnimeResponse>(
    accessToken,
    `https://api.myanimelist.net/v2/anime/${malId}?fields=${MAL_ANIME_FIELDS}`,
    'MAL anime lookup'
  )
  const watched = current.my_list_status?.num_episodes_watched ?? 0
  const total =
    typeof current.num_episodes === 'number' && current.num_episodes > 0
      ? current.num_episodes
      : null
  const meanScore =
    typeof current.mean === 'number' && Number.isFinite(current.mean)
      ? current.mean
      : null
  const coverUrl =
    current.main_picture?.large ?? current.main_picture?.medium ?? null

  return { watched, total, meanScore, coverUrl }
}

export async function fetchMalAnimeDetails(
  malId: number
): Promise<MalAnimeDetails> {
  return fetchMalAnime(await getMalAccessToken(), malId)
}

async function patchMalListStatus(
  accessToken: string,
  malId: number,
  params: URLSearchParams
): Promise<void> {
  const response = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}/my_list_status`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    }
  )

  if (!response.ok) {
    throw new MalHttpError(
      'MAL list update',
      response.status,
      await response.text()
    )
  }
}

export async function setMalWatchedEpisode(
  malId: number,
  episodeNumber: number
): Promise<{ updated: boolean; watched: number; total: number | null }> {
  const accessToken = await getMalAccessToken()
  const { watched, total } = await fetchMalAnime(accessToken, malId)

  if (watched === episodeNumber) {
    return { updated: false, watched, total }
  }

  const params = new URLSearchParams({
    num_watched_episodes: String(episodeNumber),
  })

  if (episodeNumber > 0) {
    params.set('status', 'watching')
  }

  await patchMalListStatus(accessToken, malId, params)
  return { updated: true, watched: episodeNumber, total }
}

type MalUserListStatus = 'watching' | 'on_hold'

export async function setMalAnimeListStatus(
  malId: number,
  status: MalUserListStatus
): Promise<void> {
  await patchMalListStatus(
    await getMalAccessToken(),
    malId,
    new URLSearchParams({ status })
  )
}

export async function setMalWatchingStatus(malId: number): Promise<void> {
  await setMalAnimeListStatus(malId, 'watching')
}

export async function completeMalAnime(
  malId: number,
  score: number
): Promise<{ watched: number; total: number | null }> {
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    throw new Error('score must be an integer from 1 to 10')
  }

  const accessToken = await getMalAccessToken()
  const { watched, total } = await fetchMalAnime(accessToken, malId)

  const params = new URLSearchParams({
    status: 'completed',
    score: String(score),
  })

  const episodesWatched =
    total !== null && total > 0 ? total : watched > 0 ? watched : 0
  if (episodesWatched > 0) {
    params.set('num_watched_episodes', String(episodesWatched))
  }

  await patchMalListStatus(accessToken, malId, params)
  return { watched: episodesWatched, total }
}

/** Follows `paging.next` from `firstUrl` and returns every page's items. */
export async function fetchMalPages<T>(
  accessToken: string,
  firstUrl: string,
  lookup: string
): Promise<T[]> {
  const items: T[] = []
  let nextUrl: string | undefined = firstUrl

  while (nextUrl) {
    const page: MalPage<T> = await malGet<MalPage<T>>(
      accessToken,
      nextUrl,
      lookup
    )
    items.push(...(page.data ?? []))
    nextUrl = page.paging?.next
  }

  return items
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

export async function fetchPlanToWatchAnime(): Promise<MalPlanToWatchResult> {
  try {
    const items = await fetchMalPages<MalAnimelistEntry>(
      await getMalAccessToken(),
      `https://api.myanimelist.net/v2/users/@me/animelist?status=plan_to_watch&limit=100&fields=${MAL_ANIMELIST_FIELDS}`,
      'MAL plan-to-watch lookup'
    )
    const entries = items
      .filter((item) => item.node?.id)
      .map((item) => parsePlanToWatchEntry(item.node))

    return { status: 'ok', entries }
  } catch (error) {
    if (error instanceof MalConfigError) {
      return { status: 'not_configured' }
    }

    return { status: 'unavailable' }
  }
}

export async function searchMalAnime(query: string) {
  const accessToken = await getMalAccessToken()
  const params = new URLSearchParams({
    q: query.trim(),
    limit: '5',
    fields: 'id,title,alternative_titles',
  })

  const data = await malGet<MalSearchResponse>(
    accessToken,
    `https://api.myanimelist.net/v2/anime?${params.toString()}`,
    'MAL anime search'
  )

  return (data.data ?? []).map((item) => ({
    malId: item.node.id,
    title: item.node.title,
    alternativeTitles: {
      en: item.node.alternative_titles?.en,
      ja: item.node.alternative_titles?.ja,
      synonyms: item.node.alternative_titles?.synonyms,
    },
  }))
}

export async function fetchMalAnimeTitles(malId: number): Promise<{
  title: string | null
  titleEnglish: string | null
  numEpisodes: number | null
  broadcast: MalBroadcast | null
}> {
  const accessToken = await getMalAccessToken()
  const data = await malGet<MalAnimeResponse>(
    accessToken,
    `https://api.myanimelist.net/v2/anime/${malId}?fields=title,alternative_titles,num_episodes,broadcast`,
    'MAL anime lookup'
  )
  return {
    title: data.title?.trim() || null,
    titleEnglish: data.alternative_titles?.en?.trim() || null,
    numEpisodes: positiveNumber(data.num_episodes),
    broadcast: data.broadcast?.day_of_the_week
      ? {
          dayOfWeek: data.broadcast.day_of_the_week,
          startTime: data.broadcast.start_time ?? null,
        }
      : null,
  }
}

function getNames(items?: Array<{ name?: string }>): string[] {
  return (items ?? [])
    .map((item) => item.name?.trim())
    .filter((name): name is string => Boolean(name))
}

function positiveNumber(value: number | undefined): number | null {
  return typeof value === 'number' && value > 0 ? value : null
}

function parseCompletedEntry(
  node: MalCompletedNode,
  listStatus: MalCompletedListStatus = {}
): WatchedEntry {
  return {
    malId: node.id,
    title: node.title,
    titleEnglish: node.alternative_titles?.en?.trim() || undefined,
    coverUrl: node.main_picture?.large ?? node.main_picture?.medium ?? null,
    mediaType: node.media_type || null,
    numEpisodes:
      typeof node.num_episodes === 'number' && node.num_episodes > 0
        ? node.num_episodes
        : null,
    episodeDurationSec:
      typeof node.average_episode_duration === 'number' &&
      node.average_episode_duration > 0
        ? node.average_episode_duration
        : null,
    season:
      node.start_season?.year && node.start_season.season
        ? { year: node.start_season.year, season: node.start_season.season }
        : null,
    meanScore: typeof node.mean === 'number' ? node.mean : null,
    genres: getNames(node.genres),
    studios: getNames(node.studios),
    score: listStatus.score && listStatus.score > 0 ? listStatus.score : null,
    startedAt: listStatus.start_date || null,
    finishedAt: listStatus.finish_date || null,
    updatedAt: listStatus.updated_at || null,
    timesRewatched: listStatus.num_times_rewatched ?? 0,
  }
}

/** Your completed list on MAL, fetched live (all pages). */
export async function fetchCompletedAnime(): Promise<WatchedEntry[]> {
  const items = await fetchMalPages<MalCompletedItem>(
    await getMalAccessToken(),
    `https://api.myanimelist.net/v2/users/@me/animelist?status=completed&limit=1000&nsfw=true&fields=${encodeURIComponent(MAL_COMPLETED_FIELDS)}`,
    'MAL completed list lookup'
  )
  return items
    .filter((item) => item.node?.id)
    .map((item) => parseCompletedEntry(item.node, item.list_status))
}

function parsePtwDetails(
  node: MalPtwDetailsNode,
  listStatus: { updated_at?: string } = {}
): PtwDetails {
  return {
    malId: node.id,
    synopsis: node.synopsis?.trim() || null,
    coverUrl: node.main_picture?.large ?? node.main_picture?.medium ?? null,
    meanScore: positiveNumber(node.mean),
    rank: positiveNumber(node.rank),
    popularity: positiveNumber(node.popularity),
    numListUsers: positiveNumber(node.num_list_users),
    mediaType: node.media_type || null,
    numEpisodes: positiveNumber(node.num_episodes),
    episodeDurationSec: positiveNumber(node.average_episode_duration),
    season:
      node.start_season?.year && node.start_season.season
        ? { year: node.start_season.year, season: node.start_season.season }
        : null,
    startDate: node.start_date || null,
    endDate: node.end_date || null,
    broadcast: node.broadcast?.day_of_the_week
      ? {
          dayOfWeek: node.broadcast.day_of_the_week,
          startTime: node.broadcast.start_time ?? null,
        }
      : null,
    source: node.source || null,
    rating: node.rating || null,
    genres: getNames(node.genres),
    studios: getNames(node.studios),
    addedAt: listStatus.updated_at || null,
  }
}

/** Extra info for the plan-to-watch page, fetched live (not stored in state). */
export async function fetchPlanToWatchDetails(): Promise<PtwDetails[]> {
  const items = await fetchMalPages<MalPtwDetailsItem>(
    await getMalAccessToken(),
    `https://api.myanimelist.net/v2/users/@me/animelist?status=plan_to_watch&limit=1000&nsfw=true&fields=${encodeURIComponent(MAL_PTW_DETAILS_FIELDS)}`,
    'MAL plan-to-watch details lookup'
  )
  return items
    .filter((item) => item.node?.id)
    .map((item) => parsePtwDetails(item.node, item.list_status))
}
