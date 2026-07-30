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

const MAL_ANIMELIST_FIELDS =
  'list_status,num_episodes,start_date,broadcast,main_picture,status'

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
    throw new Error('MAL_CLIENT_ID and MAL_CLIENT_SECRET must be set on Vercel.')
  }

  return { clientId, clientSecret }
}

function getMalRefreshConfig() {
  const { clientId, clientSecret } = getMalClientConfig()
  const refreshToken = process.env.MAL_REFRESH_TOKEN?.trim()

  if (!refreshToken) {
    throw new Error(
      'MAL_REFRESH_TOKEN is not set. Connect MAL from /mal and paste the refresh token into Vercel.'
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

async function getMalAccessToken(): Promise<string> {
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
  return data.access_token
}

export async function updateMalWatchedEpisode(
  malId: number,
  episodeNumber: number
): Promise<{ updated: boolean; watched: number }> {
  const accessToken = await getMalAccessToken()

  const currentResponse = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}?fields=my_list_status`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!currentResponse.ok) {
    const body = await currentResponse.text()
    throw new Error(`MAL anime lookup failed (${currentResponse.status}): ${body}`)
  }

  const current = (await currentResponse.json()) as MalAnimeResponse
  const watched = current.my_list_status?.num_episodes_watched ?? 0

  if (watched >= episodeNumber) {
    return { updated: false, watched }
  }

  const updateResponse = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}/my_list_status`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        status: 'watching',
        num_watched_episodes: String(episodeNumber),
      }),
    }
  )

  if (!updateResponse.ok) {
    const body = await updateResponse.text()
    throw new Error(`MAL list update failed (${updateResponse.status}): ${body}`)
  }

  return { updated: true, watched: episodeNumber }
}

export function formatMalWatchedLabel(
  watched: number,
  total: number | null
): string {
  if (total) {
    return `${watched} / ${total}`
  }
  return `${watched} watched`
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

export async function adjustMalWatchedEpisode(
  malId: number,
  delta: number
): Promise<{ updated: boolean; watched: number; total: number | null }> {
  const accessToken = await getMalAccessToken()
  const { watched, total } = await fetchMalAnimeStatus(accessToken, malId)
  const maxWatched = total ?? Number.POSITIVE_INFINITY
  const next = Math.max(0, Math.min(watched + delta, maxWatched))

  if (next === watched) {
    return { updated: false, watched, total }
  }

  const params = new URLSearchParams({
    num_watched_episodes: String(next),
  })

  if (next > 0) {
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

  return { updated: true, watched: next, total }
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

export async function fetchMalAnimeTitle(malId: number): Promise<string | null> {
  const accessToken = await getMalAccessToken()
  const response = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}?fields=title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`MAL anime lookup failed (${response.status}): ${body}`)
  }

  const data = (await response.json()) as MalAnimeResponse
  return data.title?.trim() || null
}
