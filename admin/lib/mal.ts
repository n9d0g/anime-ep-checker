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
  num_episodes?: number
  mean?: number
  main_picture?: MalMainPicture
  my_list_status?: MalListStatus
}

const MAL_ANIME_FIELDS =
  'num_episodes,my_list_status,mean,main_picture'

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
