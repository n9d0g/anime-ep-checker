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

interface MalCompletedResponse {
  data?: Array<{ node: MalCompletedNode; list_status?: MalCompletedListStatus }>
  paging?: { next?: string }
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

interface MalPtwDetailsResponse {
  data?: Array<{ node: MalPtwDetailsNode; list_status?: { updated_at?: string } }>
  paging?: { next?: string }
}

interface MalAnimelistResponse {
  data?: MalAnimelistEntry[]
  paging?: {
    next?: string
  }
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

const MAL_ANIME_FIELDS =
  'title,num_episodes,my_list_status,mean,main_picture'

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

export interface MalAnimeDetails {
  watched: number
  total: number | null
  meanScore: number | null
  coverUrl: string | null
}

function getMalClientConfig() {
  const clientId = process.env.MAL_CLIENT_ID?.trim()
  const clientSecret = process.env.MAL_CLIENT_SECRET?.trim()

  if (!clientId || !clientSecret) {
    throw new Error('MAL_CLIENT_ID and MAL_CLIENT_SECRET must be set on Cloudflare.')
  }

  return { clientId, clientSecret }
}

function getMalRefreshConfig() {
  const { clientId, clientSecret } = getMalClientConfig()
  const refreshToken = process.env.MAL_REFRESH_TOKEN?.trim()

  if (!refreshToken) {
    throw new Error(
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

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`MAL token exchange failed (${response.status}): ${body}`)
  }

  return response.json() as Promise<MalTokenResponse>
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

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`MAL token refresh failed (${response.status}): ${body}`)
  }

  const data = (await response.json()) as MalTokenResponse
  cachedMalAccessToken = data.access_token
  malAccessTokenExpiresAt = now + (data.expires_in ?? 3600) * 1000
  return cachedMalAccessToken
}

async function fetchMalAnimeStatus(
  accessToken: string,
  malId: number
): Promise<{ watched: number; total: number | null }> {
  const response = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}?fields=${MAL_ANIME_FIELDS}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`MAL anime lookup failed (${response.status}): ${body}`)
  }

  const current = (await response.json()) as MalAnimeResponse
  const watched = current.my_list_status?.num_episodes_watched ?? 0
  const total =
    typeof current.num_episodes === 'number' && current.num_episodes > 0
      ? current.num_episodes
      : null

  return { watched, total }
}

export async function fetchMalAnimeDetails(
  malId: number
): Promise<MalAnimeDetails> {
  const accessToken = await getMalAccessToken()
  const response = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}?fields=${MAL_ANIME_FIELDS}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`MAL anime lookup failed (${response.status}): ${body}`)
  }

  const current = (await response.json()) as MalAnimeResponse
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

export async function setMalWatchedEpisode(
  malId: number,
  episodeNumber: number
): Promise<{ updated: boolean; watched: number; total: number | null }> {
  const accessToken = await getMalAccessToken()
  const { watched, total } = await fetchMalAnimeStatus(accessToken, malId)

  if (watched === episodeNumber) {
    return { updated: false, watched, total }
  }

  const params = new URLSearchParams({
    num_watched_episodes: String(episodeNumber),
  })

  if (episodeNumber > 0) {
    params.set('status', 'watching')
  }

  const updateResponse = await fetch(
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

  if (!updateResponse.ok) {
    const body = await updateResponse.text()
    throw new Error(`MAL list update failed (${updateResponse.status}): ${body}`)
  }

  return { updated: true, watched: episodeNumber, total }
}

export type MalUserListStatus = 'watching' | 'on_hold'

export async function setMalAnimeListStatus(
  malId: number,
  status: MalUserListStatus
): Promise<void> {
  const accessToken = await getMalAccessToken()
  const updateResponse = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}/my_list_status`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ status }),
    }
  )

  if (!updateResponse.ok) {
    const body = await updateResponse.text()
    throw new Error(`MAL list update failed (${updateResponse.status}): ${body}`)
  }
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
  const { watched, total } = await fetchMalAnimeStatus(accessToken, malId)

  const params = new URLSearchParams({
    status: 'completed',
    score: String(score),
  })

  const episodesWatched =
    total !== null && total > 0 ? total : watched > 0 ? watched : 0
  if (episodesWatched > 0) {
    params.set('num_watched_episodes', String(episodesWatched))
  }

  const updateResponse = await fetch(
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

  if (!updateResponse.ok) {
    const body = await updateResponse.text()
    throw new Error(`MAL list update failed (${updateResponse.status}): ${body}`)
  }

  return { watched: episodesWatched, total }
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
): Promise<MalAnimelistResponse> {
  const requestUrl =
    url ??
    `https://api.myanimelist.net/v2/users/@me/animelist?status=plan_to_watch&limit=100&fields=${MAL_ANIMELIST_FIELDS}`

  const response = await fetch(requestUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`MAL plan-to-watch lookup failed (${response.status}): ${body}`)
  }

  return (await response.json()) as MalAnimelistResponse
}

export async function fetchPlanToWatchAnime(): Promise<MalPlanToWatchResult> {
  try {
    const accessToken = await getMalAccessToken()
    const entries: MalPlanToWatchEntry[] = []
    let nextUrl: string | undefined

    do {
      const page = await fetchPlanToWatchPage(accessToken, nextUrl)

      for (const item of page.data ?? []) {
        if (item.node?.id) {
          entries.push(parsePlanToWatchEntry(item.node))
        }
      }

      nextUrl = page.paging?.next
    } while (nextUrl)

    return { status: 'ok', entries }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (
      message.includes('MAL_CLIENT_ID') ||
      message.includes('MAL_REFRESH_TOKEN')
    ) {
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

  const response = await fetch(
    `https://api.myanimelist.net/v2/anime?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`MAL anime search failed (${response.status}): ${body}`)
  }

  const data = (await response.json()) as MalSearchResponse

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

export async function fetchMalAnimeTitles(
  malId: number
): Promise<{ title: string | null; titleEnglish: string | null }> {
  const accessToken = await getMalAccessToken()
  const response = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}?fields=title,alternative_titles`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`MAL anime lookup failed (${response.status}): ${body}`)
  }

  const data = (await response.json()) as MalAnimeResponse
  return {
    title: data.title?.trim() || null,
    titleEnglish: data.alternative_titles?.en?.trim() || null,
  }
}

export async function fetchMalAnimeTitle(malId: number): Promise<string | null> {
  const { title } = await fetchMalAnimeTitles(malId)
  return title
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
  const accessToken = await getMalAccessToken()
  const entries: WatchedEntry[] = []
  let nextUrl: string | undefined =
    `https://api.myanimelist.net/v2/users/@me/animelist?status=completed&limit=1000&nsfw=true&fields=${encodeURIComponent(MAL_COMPLETED_FIELDS)}`

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`MAL completed list lookup failed (${response.status}): ${body}`)
    }

    const page = (await response.json()) as MalCompletedResponse
    for (const item of page.data ?? []) {
      if (item.node?.id) {
        entries.push(parseCompletedEntry(item.node, item.list_status))
      }
    }
    nextUrl = page.paging?.next
  }

  return entries
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
  const accessToken = await getMalAccessToken()
  const details: PtwDetails[] = []
  let nextUrl: string | undefined =
    `https://api.myanimelist.net/v2/users/@me/animelist?status=plan_to_watch&limit=1000&nsfw=true&fields=${encodeURIComponent(MAL_PTW_DETAILS_FIELDS)}`

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`MAL plan-to-watch details lookup failed (${response.status}): ${body}`)
    }

    const page = (await response.json()) as MalPtwDetailsResponse
    for (const item of page.data ?? []) {
      if (item.node?.id) {
        details.push(parsePtwDetails(item.node, item.list_status))
      }
    }
    nextUrl = page.paging?.next
  }

  return details
}
