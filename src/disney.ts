import type { EpisodeSnapshot } from './types.js'

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const DISNEY_CONTENT_EDGE_BASE = 'https://disney.content.edge.bamgrid.com/svc/content'
const DISNEY_EXPLORE_URL = 'https://disney.api.edge.bamgrid.com/explore/v1.18/page'
const DISNEY_TOKEN_URL = 'https://disney.api.edge.bamgrid.com/token'
const DISNEY_API_KEY =
  'ZGlzbmV5JmJyb3dzZXImMS4wLjA.Cu56AgSfBTDag5NiRA81oLHkDZfu5L3CKadnefEAY84'

interface DisneyTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
}

interface DisneyEpisodeCandidate {
  id: string
  episodeNumber: number
  seasonNumber: number
  title?: string
  seasonId: string
  seasonTitle: string
  availableAt: string | null
  watchUrl: string
  isAvailable: boolean
}

export function parseDisneyIdFromUrl(url: string): string {
  const entityMatch = String(url).match(
    /\/browse\/entity-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  )
  if (entityMatch) {
    return entityMatch[1]
  }

  const seriesMatch = String(url).match(/\/series\/[a-z0-9-]+\/([a-zA-Z0-9-]+)/i)
  if (seriesMatch) {
    return seriesMatch[1]
  }

  throw new Error(`Could not parse Disney+ ID from URL: ${url}`)
}

export function buildDisneyBrowseUrl(disneyId: string): string {
  if (/^[0-9a-f-]{36}$/i.test(disneyId)) {
    return `https://www.disneyplus.com/browse/entity-${disneyId}`
  }
  return `https://www.disneyplus.com/series/${disneyId}`
}

function buildDisneyPlayUrl(episodeId: string): string {
  return `https://www.disneyplus.com/play/${episodeId}`
}

export class DisneyAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DisneyAuthError'
  }
}

function getDisneyRegion(): string {
  return process.env.DISNEY_REGION?.trim() || 'US'
}

function getDisneyRefreshToken(): string | null {
  const refreshToken = process.env.DISNEY_REFRESH_TOKEN?.trim()
  return refreshToken || null
}

async function exchangeRefreshToken(
  refreshToken: string
): Promise<DisneyTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    latitude: '0',
    longitude: '0',
    platform: 'browser',
  })

  const response = await fetch(DISNEY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DISNEY_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      'x-bamsdk-platform': 'javascript/macosx/safari',
    },
    body,
  })

  const data = (await response.json()) as DisneyTokenResponse

  if (!response.ok) {
    const detail = String(data.error_description ?? data.error ?? response.statusText)
    if (response.status === 401 || response.status === 403) {
      throw new DisneyAuthError(
        `Disney+ refresh token exchange ${response.status}: ${detail}`
      )
    }
    if (
      response.status === 400 &&
      (data.error === 'invalid_grant' ||
        detail.includes('invalid') ||
        detail.includes('forbidden-location'))
    ) {
      throw new DisneyAuthError(
        detail.includes('forbidden-location')
          ? `Disney+ refresh token exchange blocked by geo/IP (${detail}). Disney shows are skipped for this run; run pnpm check from a residential IP to check Disney titles.`
          : `Disney+ refresh token is invalid or expired: ${detail}`
      )
    }
    throw new DisneyAuthError(
      `Disney+ refresh token exchange ${response.status}: ${detail.slice(0, 200)}`
    )
  }

  if (!data.access_token) {
    throw new DisneyAuthError(
      'Disney+ refresh token exchange succeeded but access_token was missing'
    )
  }

  if (
    data.refresh_token &&
    data.refresh_token !== refreshToken &&
    process.env.NODE_ENV !== 'test'
  ) {
    console.warn(
      'Disney+ returned a rotated refresh token. Update DISNEY_REFRESH_TOKEN if checks start failing.'
    )
  }

  return data
}

function isEntityUuid(disneyId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    disneyId
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function getReleaseDate(releases: unknown): string | null {
  if (!Array.isArray(releases)) {
    return null
  }

  const now = Date.now()
  let best: string | null = null

  for (const release of releases) {
    if (!isRecord(release)) continue
    const releaseDate =
      getString(release.releaseDate) ??
      getString(release.releaseDateTime) ??
      getString(release.release_date)
    if (!releaseDate) continue
    const timestamp = Date.parse(releaseDate)
    if (!Number.isFinite(timestamp) || timestamp > now) continue
    if (!best || timestamp > Date.parse(best)) {
      best = releaseDate
    }
  }

  return best
}

function compareCandidates(
  left: DisneyEpisodeCandidate,
  right: DisneyEpisodeCandidate
): number {
  if (left.seasonNumber !== right.seasonNumber) {
    return left.seasonNumber - right.seasonNumber
  }
  return left.episodeNumber - right.episodeNumber
}

function pickBestEpisode(
  candidates: DisneyEpisodeCandidate[]
): DisneyEpisodeCandidate | null {
  if (candidates.length === 0) {
    return null
  }

  const available = candidates.filter((candidate) => candidate.isAvailable)
  const pool = available.length > 0 ? available : candidates
  return pool.reduce((current, candidate) =>
    compareCandidates(candidate, current) > 0 ? candidate : current
  )
}

function toEpisodeSnapshot(
  disneyId: string,
  seriesTitle: string,
  candidate: DisneyEpisodeCandidate
): EpisodeSnapshot {
  return {
    provider: 'disney',
    seriesId: disneyId,
    seriesTitle,
    seasonId: candidate.seasonId,
    seasonTitle: candidate.seasonTitle,
    episode: {
      id: candidate.id,
      episode: candidate.episodeNumber,
      title: candidate.title,
      availableAt: candidate.availableAt,
    },
    watchUrl: candidate.watchUrl,
  }
}

async function fetchContentEdgeJson(path: string): Promise<Record<string, unknown> | null> {
  const region = getDisneyRegion()
  const url = `${DISNEY_CONTENT_EDGE_BASE}/${path}/region/${region}/audience/k-false,l-true/maturity/1850/language/en`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  })

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as { data?: unknown }
  if (!isRecord(data.data)) {
    return null
  }

  return data.data
}

function getNestedTitle(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined

  const direct =
    getString(value.title) ??
    getString(value.name) ??
    getString(value.full)
  if (direct) return direct

  const text = value.text
  if (!isRecord(text)) return undefined

  const title = text.title
  if (!isRecord(title)) return undefined

  const full = title.full
  if (!isRecord(full)) return undefined

  for (const nested of Object.values(full)) {
    if (!isRecord(nested)) continue
    const content = getString(nested.content)
    if (content) return content
  }

  return undefined
}

function parseContentEdgeEpisode(
  node: Record<string, unknown>,
  context: {
    seasonId: string
    seasonTitle: string
    seasonNumber: number
    seriesBrowseUrl: string
  }
): DisneyEpisodeCandidate | null {
  const episodeNumber =
    getNumber(node.episodeSequenceNumber) ??
    getNumber(node.episodeNumber) ??
    getNumber(node.sequenceNumber)

  if (episodeNumber === undefined) {
    return null
  }

  const id =
    getString(node.contentId) ??
    getString(node.mediaId) ??
    getString(node.episodeId) ??
    `${context.seasonId}-${episodeNumber}`

  const title =
    getNestedTitle(node.text) ??
    getNestedTitle(node) ??
    getString(node.title)

  const availableAt = getReleaseDate(node.releases)
  const isAvailable = availableAt !== null || node.releases === undefined

  return {
    id,
    episodeNumber,
    seasonNumber: context.seasonNumber,
    title,
    seasonId: context.seasonId,
    seasonTitle: context.seasonTitle,
    availableAt,
    watchUrl: buildDisneyPlayUrl(id),
    isAvailable,
  }
}

async function fetchEpisodesForSeasonAnonymous(
  seasonId: string,
  seasonTitle: string,
  seasonNumber: number,
  seriesBrowseUrl: string
): Promise<DisneyEpisodeCandidate[]> {
  const path = `DmcEpisodes/version/5.1/seasonId/${seasonId}/pageSize/30/page/1`
  const data = await fetchContentEdgeJson(path)
  if (!data) {
    return []
  }

  const episodesRoot = isRecord(data.DmcEpisodes) ? data.DmcEpisodes : data
  const videos = Array.isArray(episodesRoot.videos)
    ? episodesRoot.videos
    : Array.isArray(episodesRoot.items)
      ? episodesRoot.items
      : []

  const candidates: DisneyEpisodeCandidate[] = []

  for (const video of videos) {
    if (!isRecord(video)) continue
    const parsed = parseContentEdgeEpisode(video, {
      seasonId,
      seasonTitle,
      seasonNumber,
      seriesBrowseUrl,
    })
    if (parsed) {
      candidates.push(parsed)
    }
  }

  return candidates
}

async function fetchSeriesBundleAnonymous(
  disneyId: string
): Promise<{ seriesTitle: string; candidates: DisneyEpisodeCandidate[] } | null> {
  if (isEntityUuid(disneyId)) {
    return null
  }

  const path = `DmcSeriesBundle/version/5.1/encodedSeriesId/${disneyId}`
  const data = await fetchContentEdgeJson(path)
  if (!data) {
    return null
  }

  const bundle = isRecord(data.DmcSeriesBundle) ? data.DmcSeriesBundle : data
  const seriesTitle =
    getNestedTitle(bundle.series) ??
    getNestedTitle(bundle) ??
    'Unknown series'

  const seasonsRoot = isRecord(bundle.seasons) ? bundle.seasons : null
  const seasons = Array.isArray(seasonsRoot?.seasons)
    ? seasonsRoot.seasons
    : Array.isArray(bundle.seasons)
      ? bundle.seasons
      : []

  const seriesBrowseUrl = buildDisneyBrowseUrl(disneyId)
  const candidates: DisneyEpisodeCandidate[] = []

  for (const season of seasons) {
    if (!isRecord(season)) continue

    const seasonId = getString(season.seasonId) ?? getString(season.id)
    if (!seasonId) continue

    const seasonNumber =
      getNumber(season.seasonSequenceNumber) ??
      getNumber(season.sequenceNumber) ??
      candidates.length + 1

    const seasonTitle =
      getNestedTitle(season) ??
      getString(season.title) ??
      `Season ${seasonNumber}`

    const seasonEpisodes = await fetchEpisodesForSeasonAnonymous(
      seasonId,
      seasonTitle,
      seasonNumber,
      seriesBrowseUrl
    )
    candidates.push(...seasonEpisodes)
  }

  if (candidates.length === 0) {
    return null
  }

  return { seriesTitle, candidates }
}

function getEpisodeWatchUrl(
  item: Record<string, unknown>,
  fallback: string
): string {
  const actions = item.actions
  if (Array.isArray(actions)) {
    for (const action of actions) {
      if (!isRecord(action)) continue
      const deeplinkId = getString(action.deeplinkId)
      if (deeplinkId) {
        return buildDisneyPlayUrl(deeplinkId)
      }
      const deeplink = action.deeplink
      if (isRecord(deeplink)) {
        const href = getString(deeplink.href) ?? getString(deeplink.url)
        if (href) {
          return href.startsWith('http')
            ? href
            : `https://www.disneyplus.com${href}`
        }
      }
    }
  }

  const id = getString(item.id)
  if (id) {
    return buildDisneyPlayUrl(id)
  }

  return fallback
}

function parseExploreEpisodes(
  exploreData: Record<string, unknown>,
  disneyId: string
): { seriesTitle: string; candidates: DisneyEpisodeCandidate[] } {
  const page = isRecord(exploreData.page) ? exploreData.page : exploreData
  const seriesTitle =
    getString((isRecord(page.visuals) ? page.visuals : null)?.title) ??
    getString((isRecord(page.visuals) ? page.visuals : null)?.name) ??
    getString(page.title) ??
    'Unknown series'

  const seriesBrowseUrl = buildDisneyBrowseUrl(disneyId)
  const candidates: DisneyEpisodeCandidate[] = []
  const containers = Array.isArray(page.containers) ? page.containers : []

  for (const container of containers) {
    if (!isRecord(container) || container.type !== 'episodes') {
      continue
    }

    const seasons = Array.isArray(container.seasons) ? container.seasons : []
    for (const season of seasons) {
      if (!isRecord(season)) continue

      const seasonId = getString(season.id) ?? disneyId
      const seasonVisuals = isRecord(season.visuals) ? season.visuals : null
      const seasonTitle =
        getString(seasonVisuals?.name) ??
        getString(seasonVisuals?.title) ??
        'Season'
      const seasonNumber =
        getNumber(seasonVisuals?.seasonNumber) ??
        getNumber(season.sequenceNumber) ??
        1

      const items = Array.isArray(season.items) ? season.items : []
      for (const item of items) {
        if (!isRecord(item)) continue

        const visuals = isRecord(item.visuals) ? item.visuals : null
        const episodeNumber = getNumber(visuals?.episodeNumber)
        if (episodeNumber === undefined) continue

        const title = getString(visuals?.episodeTitle) ?? getString(visuals?.title)
        const isUnavailable = visuals?.isUnavailable === true
        const availableAt = getReleaseDate(item.releases)
        const id = getString(item.id) ?? `${seasonId}-${episodeNumber}`

        candidates.push({
          id,
          episodeNumber,
          seasonNumber,
          title,
          seasonId,
          seasonTitle,
          availableAt,
          watchUrl: getEpisodeWatchUrl(item, seriesBrowseUrl),
          isAvailable: !isUnavailable,
        })
      }
    }
  }

  return { seriesTitle, candidates }
}

async function fetchExplorePage(
  disneyId: string,
  bearer: string
): Promise<Record<string, unknown>> {
  const entityRef = isEntityUuid(disneyId) ? `entity-${disneyId}` : disneyId
  const url = new URL(`${DISNEY_EXPLORE_URL}/${entityRef}`)
  url.searchParams.set('disableSmartFocus', 'true')
  url.searchParams.set('enhancedContainersLimit', '15')
  url.searchParams.set('limit', '15')

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      'x-dss-edge-accept': 'vnd.dss.edge+json; version=2',
      'x-bamsdk-platform': 'javascript/macosx/safari',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    if (response.status === 401 || response.status === 403) {
      throw new DisneyAuthError(
        `Disney+ explore API ${response.status}: ${body.slice(0, 200)}`
      )
    }
    throw new Error(
      `Disney+ explore API ${response.status}: ${body.slice(0, 200)}`
    )
  }

  const data = (await response.json()) as { data?: Record<string, unknown> }
  if (!data.data || !isRecord(data.data)) {
    throw new Error('Disney+ explore response missing data')
  }

  return data.data
}

export async function getLatestAvailableEpisodeForTitle(
  disneyId: string
): Promise<EpisodeSnapshot | null> {
  const anonymous = await fetchSeriesBundleAnonymous(disneyId)
  if (anonymous) {
    const best = pickBestEpisode(anonymous.candidates)
    if (best) {
      return toEpisodeSnapshot(disneyId, anonymous.seriesTitle, best)
    }
  }

  const refreshToken = getDisneyRefreshToken()
  if (!refreshToken) {
    throw new DisneyAuthError(
      'Disney+ anonymous metadata is unavailable and DISNEY_REFRESH_TOKEN is not set. Copy a refresh token from DevTools on disneyplus.com (see README §6) into GitHub Actions secrets.'
    )
  }

  const token = await exchangeRefreshToken(refreshToken)
  const exploreData = await fetchExplorePage(disneyId, token.access_token!)
  const explore = parseExploreEpisodes(exploreData, disneyId)
  const best = pickBestEpisode(explore.candidates)
  if (!best) {
    return null
  }

  return toEpisodeSnapshot(disneyId, explore.seriesTitle, best)
}
