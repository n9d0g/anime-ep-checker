export interface MalProgress {
  watched: number
  total: number | null
}

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

function getMalConfig() {
  const clientId = process.env.MAL_CLIENT_ID?.trim()
  const clientSecret = process.env.MAL_CLIENT_SECRET?.trim()
  const refreshToken = process.env.MAL_REFRESH_TOKEN?.trim()

  if (!clientId || !clientSecret || !refreshToken) {
    return null
  }

  return { clientId, clientSecret, refreshToken }
}

async function getMalAccessToken(): Promise<string | null> {
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
    console.warn(`MAL token refresh failed (${response.status})`)
    return null
  }

  const data = (await response.json()) as MalTokenResponse
  return data.access_token
}

export async function fetchMalProgress(
  malId: number
): Promise<MalProgress | null> {
  const accessToken = await getMalAccessToken()
  if (!accessToken) return null

  const response = await fetch(
    `https://api.myanimelist.net/v2/anime/${malId}?fields=num_episodes,my_list_status`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )

  if (!response.ok) {
    console.warn(`MAL anime lookup failed (${response.status}) for id ${malId}`)
    return null
  }

  const data = (await response.json()) as MalAnimeResponse
  const watched = data.my_list_status?.num_episodes_watched ?? 0
  const total =
    typeof data.num_episodes === 'number' && data.num_episodes > 0
      ? data.num_episodes
      : null

  return { watched, total }
}

export function isMalConfigured(): boolean {
  return getMalConfig() !== null
}
