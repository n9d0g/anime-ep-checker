// Google Calendar API client: service-account auth and the event calls the
// checker makes. Every event it writes is tagged with the show and episode it
// belongs to, so a show's events can be listed back without stored state.
import { createSign } from 'node:crypto'

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const SHOW_ID_PROP = 'animeEpCheckerShowId'
const EPISODE_PROP = 'animeEpCheckerEpisode'

export interface GoogleCalendarConfig {
  serviceAccountJson?: string
  calendarId?: string
}

/** A show's event as listed from the calendar. */
export interface ListedCalendarEvent {
  eventId: string
  /** The episode tag, or null for an event without one. */
  episode: string | null
  /** The event's start `dateTime` exactly as the API returned it. */
  startAt: string | null
}

/** What the checker writes for one episode's event. */
export interface CalendarEventDetails {
  showId: string
  episode: number
  summary: string
  description: string
  location: string | null
  startAt: Date
  endAt: Date
}

interface ServiceAccountCredentials {
  client_email: string
  private_key: string
}

interface CalendarEventListResponse {
  items?: {
    id: string
    start?: { dateTime?: string }
    extendedProperties?: { private?: Record<string, string> }
  }[]
}

let cachedAccessToken: string | null = null
let tokenExpiresAt = 0

export function hasCalendarConfig(config: GoogleCalendarConfig): boolean {
  return Boolean(config.serviceAccountJson?.trim() && config.calendarId?.trim())
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
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON must include client_email and private_key'
    )
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
    throw new Error(
      `Google token exchange failed (${response.status}): ${body}`
    )
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

function buildEventResource(
  details: CalendarEventDetails
): Record<string, unknown> {
  return {
    summary: details.summary,
    description: details.description,
    location: details.location || undefined,
    start: { dateTime: details.startAt.toISOString(), timeZone: 'UTC' },
    end: { dateTime: details.endAt.toISOString(), timeZone: 'UTC' },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 10 },
        { method: 'popup', minutes: 0 },
      ],
    },
    extendedProperties: {
      private: {
        [SHOW_ID_PROP]: details.showId,
        [EPISODE_PROP]: String(details.episode),
      },
    },
  }
}

/** Creates the event and returns its id. */
export async function createCalendarEvent(
  config: GoogleCalendarConfig,
  details: CalendarEventDetails
): Promise<string> {
  const response = await calendarRequest(config, '/events', {
    method: 'POST',
    body: JSON.stringify(buildEventResource(details)),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Google Calendar create failed (${response.status}): ${text}`
    )
  }

  const data = (await response.json()) as { id: string }
  return data.id
}

export async function updateCalendarEvent(
  config: GoogleCalendarConfig,
  eventId: string,
  details: CalendarEventDetails
): Promise<void> {
  const response = await calendarRequest(
    config,
    `/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(buildEventResource(details)),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      `Google Calendar update failed (${response.status}): ${text}`
    )
  }
}

/** Deletes the event; an event that is already gone is not an error. */
export async function deleteCalendarEvent(
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
    throw new Error(
      `Google Calendar delete failed (${response.status}): ${text}`
    )
  }
}

/** Lists the events tagged with this show, in the order the API returns them. */
export async function listCalendarEventsForShow(
  config: GoogleCalendarConfig,
  showId: string
): Promise<ListedCalendarEvent[]> {
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
  return (data.items ?? []).map((item) => ({
    eventId: item.id,
    episode: item.extendedProperties?.private?.[EPISODE_PROP] || null,
    startAt: item.start?.dateTime ?? null,
  }))
}
