export interface MalProgress {
  watched: number
  total: number | null
}

export type MalFetchResult =
  | { status: 'ok'; progress: MalProgress }
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
  my_list_status?: MalListStatus
}

let cachedAccessToken: string | null | undefined
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

export async function fetchMalProgress(malId: number): Promise<MalFetchResult> {
  if (!isMalConfigured()) {
    if (!configMissingLogged) {
      console.warn(
        'MAL not configured for dashboard progress. Set MAL_CLIENT_ID, MAL_CLIENT_SECRET, and MAL_REFRESH_TOKEN on GitHub Actions.'
      )
      configMissingLogged = true
    }
    return { status: 'not_configured' }
  }

  const accessToken = await getCachedMalAccessToken()
  if (!accessToken) {
    return { status: 'unavailable' }
  }

  const response = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}?fields=num_episodes,my_list_status`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    console.warn(`MAL anime lookup failed (${response.status}) for id ${malId}`)
    return { status: 'unavailable' }
  }

  const data = (await response.json()) as MalAnimeResponse
  const watched = data.my_list_status?.num_episodes_watched ?? 0
  const total =
    typeof data.num_episodes === 'number' && data.num_episodes > 0
      ? data.num_episodes
      : null

  return {
    status: 'ok',
    progress: { watched, total },
  }
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
