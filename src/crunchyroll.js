const API_BASE = 'https://beta-api.crunchyroll.com'
const AUTH_BASIC = 'Basic bm9haWhkZXZtXzZpeWcwYThsMHE6'

const EXCLUDED_SEASON_PATTERNS =
  /\b(extra|extras|ova|dub|collection|heroine|special)\b/i

let cachedToken = null
let tokenExpiresAt = 0

function randomSessionId() {
  return crypto.randomUUID()
}

export function parseSeriesIdFromUrl(url) {
  const match = String(url).match(/\/series\/([A-Z0-9]+)/i)
  if (!match) {
    throw new Error(`Could not parse Crunchyroll series ID from URL: ${url}`)
  }
  return match[1].toUpperCase()
}

export function buildWatchUrl(episode) {
  const slug = episode.slug_title || 'episode'
  return `https://www.crunchyroll.com/watch/${episode.id}/${slug}`
}

async function apiFetch(path, options = {}) {
  const token = await getAccessToken()
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Crunchyroll API ${response.status} for ${path}: ${body}`)
  }

  return response.json()
}

export async function getAccessToken() {
  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt - 60_000) {
    return cachedToken
  }

  const sessionId = randomSessionId()
  const response = await fetch(`${API_BASE}/auth/v1/token`, {
    method: 'POST',
    headers: {
      Authorization: AUTH_BASIC,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: `session_id=${sessionId}`,
    },
    body: 'grant_type=client_id',
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Crunchyroll auth failed (${response.status}): ${body}`)
  }

  const data = await response.json()
  cachedToken = data.access_token
  tokenExpiresAt = now + (data.expires_in ?? 3600) * 1000
  return cachedToken
}

function isExcludedSeason(season) {
  return EXCLUDED_SEASON_PATTERNS.test(season.title ?? '')
}

function pickLatestSeason(seasons) {
  const eligible = seasons.filter((season) => !isExcludedSeason(season))
  if (eligible.length === 0) {
    throw new Error('No eligible seasons found for series')
  }

  return eligible.reduce((latest, season) => {
    const latestSeq = latest.season_sequence_number ?? 0
    const seasonSeq = season.season_sequence_number ?? 0
    return seasonSeq >= latestSeq ? season : latest
  })
}

export function isEpisodeAvailable(episode, now = new Date()) {
  const premiumDate = episode.premium_available_date
  const freeDate = episode.free_available_date

  if (premiumDate) {
    const premiumAvailable = new Date(premiumDate) <= now
    if (premiumAvailable) return true
  }

  if (freeDate && !String(freeDate).startsWith('9998')) {
    return new Date(freeDate) <= now
  }

  return false
}

function parseEpisodeNumber(episode) {
  const value = Number(episode.episode)
  return Number.isFinite(value) ? value : 0
}

export function pickLatestAvailableEpisode(episodes, now = new Date()) {
  const available = episodes.filter((episode) => isEpisodeAvailable(episode, now))
  if (available.length === 0) return null

  return available.reduce((latest, episode) => {
    const latestNum = parseEpisodeNumber(latest)
    const episodeNum = parseEpisodeNumber(episode)
    if (episodeNum > latestNum) return episode
    if (episodeNum < latestNum) return latest

    const latestDate = new Date(latest.premium_available_date ?? 0)
    const episodeDate = new Date(episode.premium_available_date ?? 0)
    return episodeDate >= latestDate ? episode : latest
  })
}

export async function getSeriesInfo(seriesId) {
  return apiFetch(`/content/v2/cms/series/${seriesId}?locale=en-US`)
}

export async function getSeasons(seriesId) {
  const response = await apiFetch(
    `/content/v2/cms/series/${seriesId}/seasons?locale=en-US`
  )
  return response.data ?? []
}

export async function getSeasonEpisodes(seasonId) {
  const response = await apiFetch(
    `/content/v2/cms/seasons/${seasonId}/episodes?locale=en-US`
  )
  return response.data ?? []
}

export async function getLatestAvailableEpisodeForSeries(seriesId) {
  const seasons = await getSeasons(seriesId)
  const latestSeason = pickLatestSeason(seasons)
  const episodes = await getSeasonEpisodes(latestSeason.id)
  const latestEpisode = pickLatestAvailableEpisode(episodes)

  if (!latestEpisode) {
    return null
  }

  let seriesTitle = latestSeason.title
  try {
    const series = await getSeriesInfo(seriesId)
    seriesTitle = series.data?.title ?? seriesTitle
  } catch {
    // Series title is optional; season title is enough for alerts.
  }

  return {
    seriesId,
    seriesTitle,
    seasonId: latestSeason.id,
    seasonTitle: latestSeason.title,
    episode: latestEpisode,
    watchUrl: buildWatchUrl(latestEpisode),
  }
}
