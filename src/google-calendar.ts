import { createSign } from 'node:crypto'
import { formatEasternTime } from './time.js'
import {
  getShowWatchUrl,
  type Show,
  type ShowState,
  type StateFile,
} from './types.js'
import {
  getExpectedDropAt,
  getLastScheduledEpisode,
  getNextExpectedEpisode,
  isEpisodeInSchedule,
  parseEpisodeNumber,
} from './schedule.js'
import {
  getSeasonEpisodes,
  getSeasons,
  parseSeriesIdFromUrl,
} from './crunchyroll.js'

const EVENT_DURATION_MS = 30 * 60 * 1000
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const SHOW_ID_PROP = 'animeEpCheckerShowId'
const EPISODE_PROP = 'animeEpCheckerEpisode'

export interface GoogleCalendarConfig {
  serviceAccountJson?: string
  calendarId?: string
}

interface ServiceAccountCredentials {
  client_email: string
  private_key: string
}

interface CalendarEventListItem {
  id: string
  extendedProperties?: {
    private?: Record<string, string>
  }
}

interface CalendarEventListResponse {
  items?: CalendarEventListItem[]
}

let cachedAccessToken: string | null = null
let tokenExpiresAt = 0

function hasCalendarConfig(config: GoogleCalendarConfig): boolean {
  return Boolean(
    config.serviceAccountJson?.trim() && config.calendarId?.trim()
  )
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function parseServiceAccount(json: string): ServiceAccountCredentials {
  const parsed = JSON.parse(json) as ServiceAccountCredentials
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key')
  }
  return parsed
}

function signJwt(
  credentials: ServiceAccountCredentials,
  payload: Record<string, unknown>
): string {
  const header = { alg: 'RS256', typ: 'JWT' }
  const segments = [
    base64UrlEncode(JSON.stringify(header)),
    base64UrlEncode(JSON.stringify(payload)),
  ]
  const signingInput = segments.join('.')
  const sign = createSign('RSA-SHA256')
  sign.update(signingInput)
  sign.end()
  const signature = sign.sign(credentials.private_key.replace(/\\n/g, '\n'))
  segments.push(base64UrlEncode(signature))
  return segments.join('.')
}

async function getAccessToken(
  credentials: ServiceAccountCredentials
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedAccessToken && tokenExpiresAt > now + 60) {
    return cachedAccessToken
  }

  const jwt = signJwt(credentials, {
    iss: credentials.client_email,
    scope: CALENDAR_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Google token exchange failed (${response.status}): ${body}`)
  }

  const data = (await response.json()) as {
    access_token: string
    expires_in?: number
  }
  cachedAccessToken = data.access_token
  tokenExpiresAt = now + (data.expires_in ?? 3600)
  return cachedAccessToken
}

async function calendarRequest(
  config: GoogleCalendarConfig,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const credentials = parseServiceAccount(config.serviceAccountJson!)
  const token = await getAccessToken(credentials)
  const calendarId = encodeURIComponent(config.calendarId!)
  const url = `${CALENDAR_API}/calendars/${calendarId}${path}`

  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

async function createCalendarEvent(
  config: GoogleCalendarConfig,
  body: Record<string, unknown>
): Promise<string> {
  const response = await calendarRequest(config, '/events', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Calendar create failed (${response.status}): ${text}`)
  }

  const data = (await response.json()) as { id: string }
  return data.id
}

async function updateCalendarEvent(
  config: GoogleCalendarConfig,
  eventId: string,
  body: Record<string, unknown>
): Promise<void> {
  const response = await calendarRequest(
    config,
    `/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Calendar update failed (${response.status}): ${text}`)
  }
}

async function deleteCalendarEvent(
  config: GoogleCalendarConfig,
  eventId: string
): Promise<void> {
  const response = await calendarRequest(
    config,
    `/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' }
  )

  if (!response.ok && response.status !== 404) {
    const text = await response.text()
    throw new Error(`Google Calendar delete failed (${response.status}): ${text}`)
  }
}

async function listCalendarEventsForShow(
  config: GoogleCalendarConfig,
  showId: string
): Promise<CalendarEventListItem[]> {
  const params = new URLSearchParams({
    privateExtendedProperty: `${SHOW_ID_PROP}=${showId}`,
    singleEvents: 'true',
    maxResults: '250',
  })

  const response = await calendarRequest(config, `/events?${params.toString()}`)
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Calendar list failed (${response.status}): ${text}`)
  }

  const data = (await response.json()) as CalendarEventListResponse
  return data.items ?? []
}

function buildEventTitle(
  show: Show,
  episodeNumber: number,
  episodeTitle?: string | null
): string {
  const showTitle = show.title || show.id
  const base = `${showTitle} — Episode ${episodeNumber}`
  const trimmedTitle = episodeTitle?.trim()
  return trimmedTitle ? `${base}: ${trimmedTitle}` : base
}

function buildEventBody(
  show: Show,
  episodeNumber: number,
  expectedAt: Date,
  episodeTitle?: string | null
): Record<string, unknown> {
  const watchUrl = getShowWatchUrl(show)
  const startIso = expectedAt.toISOString()
  const endIso = new Date(expectedAt.getTime() + EVENT_DURATION_MS).toISOString()
  const eastern = formatEasternTime(expectedAt.toISOString())

  const descriptionParts = [
    `Expected around ${eastern}.`,
    episodeTitle?.trim() ? `Episode: ${episodeTitle.trim()}` : null,
    watchUrl ? `Watch: ${watchUrl}` : null,
  ].filter(Boolean)

  return {
    summary: buildEventTitle(show, episodeNumber, episodeTitle),
    description: descriptionParts.join('\n'),
    location: watchUrl || undefined,
    start: { dateTime: startIso, timeZone: 'UTC' },
    end: { dateTime: endIso, timeZone: 'UTC' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 10 },
        { method: 'popup', minutes: 0 },
      ],
    },
    extendedProperties: {
      private: {
        [SHOW_ID_PROP]: show.id,
        [EPISODE_PROP]: String(episodeNumber),
      },
    },
  }
}

async function lookupCrunchyrollEpisodeTitle(
  show: Show,
  showState: ShowState,
  episodeNumber: number
): Promise<string | null> {
  if (show.provider !== 'crunchyroll') {
    return null
  }

  try {
    const seriesId =
      show.seriesId ||
      (show.crunchyrollUrl ? parseSeriesIdFromUrl(show.crunchyrollUrl) : null)
    if (!seriesId) {
      return null
    }

    const seasons = await getSeasons(seriesId)
    const season =
      seasons.find((entry) => entry.id === showState.seasonId) ??
      seasons[seasons.length - 1]
    if (!season) {
      return null
    }

    const episodes = await getSeasonEpisodes(season.id)
    const match = episodes.find(
      (episode) => Number(episode.episode) === episodeNumber
    )
    return match?.title?.trim() || null
  } catch {
    return null
  }
}

interface DesiredCalendarEpisode {
  episode: number
  expectedAt: Date
  startAtIso: string
}

function getDesiredCalendarEpisodes(
  show: Show,
  showState: ShowState,
  now: Date
): DesiredCalendarEpisode[] {
  const lastEpisodeNumber = parseEpisodeNumber(showState.lastEpisodeNumber)
  const nextEpisode = getNextExpectedEpisode(show.schedule, lastEpisodeNumber)
  if (nextEpisode === null) {
    return []
  }

  const episodeNumbers: number[] = []
  if (show.schedule.mode === 'ongoing') {
    episodeNumbers.push(nextEpisode)
  } else {
    const lastScheduled = getLastScheduledEpisode(show.schedule)
    if (lastScheduled === null) {
      return []
    }
    for (let episode = nextEpisode; episode <= lastScheduled; episode++) {
      if (isEpisodeInSchedule(show.schedule, episode)) {
        episodeNumbers.push(episode)
      }
    }
  }

  const desired: DesiredCalendarEpisode[] = []
  for (const episode of episodeNumbers) {
    const expectedAt = getExpectedDropAt(show.schedule, episode)
    if (!expectedAt || expectedAt.getTime() <= now.getTime()) {
      continue
    }
    desired.push({
      episode,
      expectedAt,
      startAtIso: expectedAt.toISOString(),
    })
  }

  return desired
}

export async function clearGoogleCalendarEventForEpisode(
  config: GoogleCalendarConfig,
  showId: string,
  episodeNumber: number,
  state: StateFile
): Promise<boolean> {
  if (!hasCalendarConfig(config)) {
    return false
  }

  const showState = state.shows[showId]
  if (!showState) {
    return false
  }

  const key = String(episodeNumber)
  const storedId = showState.googleCalendarEvents?.[key]?.eventId
  if (storedId) {
    await deleteCalendarEvent(config, storedId)
    delete showState.googleCalendarEvents![key]
    if (Object.keys(showState.googleCalendarEvents!).length === 0) {
      showState.googleCalendarEvents = null
    }
    return true
  }

  const listed = await listCalendarEventsForShow(config, showId)
  const match = listed.find(
    (event) =>
      event.extendedProperties?.private?.[EPISODE_PROP] === String(episodeNumber)
  )
  if (!match) {
    return false
  }

  await deleteCalendarEvent(config, match.id)
  return true
}

export async function clearGoogleCalendarEventsForShow(
  config: GoogleCalendarConfig,
  showId: string,
  state: StateFile,
  dryRun = false
): Promise<boolean> {
  if (!hasCalendarConfig(config)) {
    return false
  }

  const showState = state.shows[showId]
  const deleteIds = new Set<string>()

  if (showState?.googleCalendarEvents) {
    for (const entry of Object.values(showState.googleCalendarEvents)) {
      deleteIds.add(entry.eventId)
    }
  }

  if (!dryRun) {
    const listed = await listCalendarEventsForShow(config, showId)
    for (const event of listed) {
      deleteIds.add(event.id)
    }
  }

  if (deleteIds.size === 0 && !showState?.googleCalendarEvents) {
    return false
  }

  let changed = false
  for (const eventId of deleteIds) {
    if (dryRun) {
      console.log(`  Would delete Google Calendar event ${eventId} for ${showId}`)
      changed = true
      continue
    }
    await deleteCalendarEvent(config, eventId)
    changed = true
    console.log(`  Google Calendar event deleted for ${showId}`)
  }

  if (showState) {
    showState.googleCalendarEvents = null
    changed = true
  }

  return changed
}

async function syncCalendarEventsForShow({
  config,
  show,
  state,
  now,
  dryRun,
}: {
  config: GoogleCalendarConfig
  show: Show
  state: StateFile
  now: Date
  dryRun: boolean
}): Promise<boolean> {
  const showTitle = show.title || show.id
  const showState = state.shows[show.id]
  if (!showState) {
    console.log(`  Skipping Google Calendar for ${showTitle} (not baselined yet)`)
    return false
  }

  const desired = getDesiredCalendarEpisodes(show, showState, now)
  const desiredKeys = new Set(desired.map((entry) => String(entry.episode)))
  let changed = false

  const listedEvents = dryRun ? [] : await listCalendarEventsForShow(config, show.id)
  const listedByEpisode = new Map<string, string>()
  for (const event of listedEvents) {
    const episode = event.extendedProperties?.private?.[EPISODE_PROP]
    if (episode) {
      listedByEpisode.set(episode, event.id)
    }
  }

  const storedMap = showState.googleCalendarEvents ?? {}
  const deleteIds = new Set<string>()

  for (const [episodeKey, entry] of Object.entries(storedMap)) {
    if (!desiredKeys.has(episodeKey)) {
      deleteIds.add(entry.eventId)
    }
  }

  for (const [episode, eventId] of listedByEpisode.entries()) {
    if (!desiredKeys.has(episode)) {
      deleteIds.add(eventId)
    }
  }

  for (const eventId of deleteIds) {
    if (dryRun) {
      console.log(`  Would delete Google Calendar event ${eventId} for ${showTitle}`)
      changed = true
      continue
    }
    await deleteCalendarEvent(config, eventId)
    changed = true
    console.log(`  Google Calendar event deleted for ${showTitle}`)
  }

  const nextMap: NonNullable<ShowState['googleCalendarEvents']> = {}
  for (const entry of desired) {
    const key = String(entry.episode)
    const episodeTitle = await lookupCrunchyrollEpisodeTitle(
      show,
      showState,
      entry.episode
    )
    const body = buildEventBody(show, entry.episode, entry.expectedAt, episodeTitle)
    const stored = storedMap[key]
    const listedId = listedByEpisode.get(key)
    const existingId = stored?.eventId ?? listedId ?? null

    if (existingId && stored?.startAt === entry.startAtIso) {
      nextMap[key] = { eventId: existingId, startAt: entry.startAtIso }
      continue
    }

    if (dryRun) {
      if (existingId) {
        console.log(
          `  Would update Google Calendar event for ${showTitle} ep ${entry.episode}`
        )
      } else {
        console.log(
          `  Would create Google Calendar event for ${showTitle} ep ${entry.episode}`
        )
      }
      changed = true
      continue
    }

    if (existingId) {
      await updateCalendarEvent(config, existingId, body)
      nextMap[key] = { eventId: existingId, startAt: entry.startAtIso }
      console.log(`  Google Calendar event updated for ${showTitle} ep ${entry.episode}`)
    } else {
      const eventId = await createCalendarEvent(config, body)
      nextMap[key] = { eventId, startAt: entry.startAtIso }
      console.log(`  Google Calendar event created for ${showTitle} ep ${entry.episode}`)
    }
    changed = true
  }

  if (!dryRun) {
    showState.googleCalendarEvents =
      Object.keys(nextMap).length > 0 ? nextMap : null
  }

  return changed
}

export async function syncGoogleCalendarEvents({
  config,
  shows,
  state,
  now = new Date(),
  dryRun = false,
}: {
  config: GoogleCalendarConfig
  shows: Show[]
  state: StateFile
  now?: Date
  dryRun?: boolean
}): Promise<boolean> {
  if (!hasCalendarConfig(config)) {
    return false
  }

  let changed = false
  for (const show of shows) {
    try {
      const showChanged = await syncCalendarEventsForShow({
        config,
        show,
        state,
        now,
        dryRun,
      })
      if (showChanged) {
        changed = true
      }
    } catch (error) {
      console.warn(
        `Google Calendar sync failed for ${show.title || show.id}: ${
          error instanceof Error ? error.message : error
        }`
      )
    }
  }

  return changed
}

export function getGoogleCalendarConfigFromEnv(): GoogleCalendarConfig {
  return {
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    calendarId: process.env.GOOGLE_CALENDAR_ID,
  }
}
