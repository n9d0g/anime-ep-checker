import assert from 'node:assert/strict'
import { generateKeyPairSync, verify } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { after, before, beforeEach, test } from 'node:test'
import {
  clearGoogleCalendarEventForEpisode,
  clearGoogleCalendarEventsForShow,
  syncGoogleCalendarEvents,
} from './google-calendar.ts'
import type { GoogleCalendarConfig } from './google-calendar.ts'
import type { Show, ShowState, StateFile } from '../shared/types.ts'

/**
 * Recorded behaviour of the Google Calendar sync: every Google request
 * (token exchange and Calendar API), the console output, the return value
 * and the stored events. Regenerate with
 * `UPDATE_SNAPSHOTS=1 node --test src/google-calendar.test.ts` only when a
 * Calendar change is intended (then run `pnpm exec oxfmt` on the snapshot;
 * comparison is structural, so formatting does not matter). Crunchyroll title lookups are not part of the
 * snapshot; each scenario asserts their count instead.
 */

const SNAPSHOT_URL = new URL(
  './__snapshots__/google-calendar.json',
  import.meta.url
)
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1'
const NOW = new Date('2026-10-22T12:00:00.000Z')
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const CRUNCHYROLL_API = 'https://beta-api.crunchyroll.com'

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
const CONFIG: GoogleCalendarConfig = {
  serviceAccountJson: JSON.stringify({
    client_email: 'checker@example.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }),
  calendarId: 'anime@group.calendar.google.com',
}

interface RecordedRequest {
  method: string
  url: string
  contentType: string | null
  authorization: string | null
  body: string | null
}

interface Recording {
  requests: RecordedRequest[]
  logs: string[]
  result: boolean
  state: StateFile
}

/** An event as the fake Calendar holds it (the API's resource shape). */
interface FakeEvent {
  id: string
  start?: { dateTime?: string }
  extendedProperties?: { private?: Record<string, string> }
}

let expected: Record<string, Recording> = {}
const actual: Record<string, Recording> = {}
let requests: RecordedRequest[] = []
let logs: string[] = []
let calendarEvents: FakeEvent[] = []
let failCreate = false
let createdCount = 0
let titleLookups = 0
const realFetch = globalThis.fetch
const realLog = console.log
const realWarn = console.warn
const RealDate = Date

before(async () => {
  if (!UPDATE) {
    expected = JSON.parse(await readFile(SNAPSHOT_URL, 'utf8'))
  }
})

after(async () => {
  globalThis.fetch = realFetch
  globalThis.Date = RealDate
  console.log = realLog
  console.warn = realWarn
  if (UPDATE) {
    const sorted = Object.fromEntries(
      Object.entries(actual).sort(([a], [b]) => a.localeCompare(b))
    )
    await writeFile(SNAPSHOT_URL, `${JSON.stringify(sorted, null, 2)}\n`)
  }
})

/** Checks the service-account JWT and replaces its signature with a marker. */
function verifyTokenRequest(body: string): string {
  const params = new URLSearchParams(body)
  const assertion = params.get('assertion') ?? ''
  const [header, payload, signature] = assertion.split('.')
  assert.ok(
    verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      publicKey,
      Buffer.from(signature, 'base64url')
    ),
    'JWT signature does not verify against the service account key'
  )
  params.set('assertion', `${header}.${payload}.SIGNATURE`)
  return params.toString()
}

function crunchyrollResponse(url: string): Response {
  if (url === `${CRUNCHYROLL_API}/auth/v1/token`) {
    return Response.json({ access_token: 'crunchyroll-token', expires_in: 0 })
  }
  if (url.includes('/content/v2/cms/series/')) {
    titleLookups++
    return Response.json({
      data: [{ id: 'season-1' }, { id: 'season-2' }],
    })
  }
  const seasonMatch = url.match(/\/content\/v2\/cms\/seasons\/([^/]+)\//)
  if (seasonMatch) {
    const offset = seasonMatch[1] === 'season-2' ? 12 : 0
    return Response.json({
      data: [4, 5].map((episode) => ({
        id: `cr-${episode + offset}`,
        episode: String(episode + offset),
        title: `  ${seasonMatch[1]} title ${episode + offset}  `,
      })),
    })
  }
  throw new Error(`Unexpected Crunchyroll fetch ${url}`)
}

function calendarResponse(method: string, url: string, body: string | null) {
  const path = url.slice(
    `${CALENDAR_API}/calendars/${encodeURIComponent(CONFIG.calendarId!)}`.length
  )
  if (method === 'GET' && path.startsWith('/events?')) {
    const params = new URLSearchParams(path.slice('/events?'.length))
    const [prop, showId] = (params.get('privateExtendedProperty') ?? '').split(
      '='
    )
    return Response.json({
      items: calendarEvents.filter(
        (event) => event.extendedProperties?.private?.[prop] === showId
      ),
    })
  }
  if (method === 'POST' && path === '/events') {
    if (failCreate) {
      return new Response('backend error', { status: 500 })
    }
    createdCount++
    const id = `created-${createdCount}`
    const parsed = JSON.parse(body ?? '{}') as FakeEvent
    calendarEvents.push({ ...parsed, id })
    return Response.json({ id })
  }
  const eventMatch = path.match(/^\/events\/([^/?]+)$/)
  if (eventMatch && method === 'PATCH') {
    return Response.json({ id: decodeURIComponent(eventMatch[1]) })
  }
  if (eventMatch && method === 'DELETE') {
    const id = decodeURIComponent(eventMatch[1])
    const exists = calendarEvents.some((event) => event.id === id)
    calendarEvents = calendarEvents.filter((event) => event.id !== id)
    return new Response(null, { status: exists ? 204 : 404 })
  }
  throw new Error(`Unexpected Calendar fetch ${method} ${url}`)
}

beforeEach(() => {
  requests = []
  logs = []
  calendarEvents = []
  failCreate = false
  createdCount = 0
  titleLookups = 0
  console.log = (...args: unknown[]) => logs.push(`log: ${args.join(' ')}`)
  console.warn = (...args: unknown[]) => logs.push(`warn: ${args.join(' ')}`)

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input instanceof Request ? input.url : input)
    const method = init?.method ?? 'GET'
    const body = init?.body === undefined ? null : String(init.body)

    if (url.startsWith(CRUNCHYROLL_API)) {
      return crunchyrollResponse(url)
    }

    const headers = new Headers(init?.headers)
    requests.push({
      method,
      url,
      contentType: headers.get('content-type'),
      authorization: headers.get('authorization'),
      body: url === TOKEN_URL && body ? verifyTokenRequest(body) : body,
    })

    if (url === TOKEN_URL) {
      // Expire immediately so every scenario exchanges its own token.
      return Response.json({ access_token: 'google-token', expires_in: 0 })
    }
    if (url.startsWith(`${CALENDAR_API}/`)) {
      return calendarResponse(method, url, body)
    }
    throw new Error(`Unexpected fetch ${method} ${url}`)
  }) as typeof fetch

  // Freeze `new Date()` / `Date.now()` so the JWT claims are stable.
  globalThis.Date = class extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(NOW.getTime())
      } else {
        super(...(args as [string]))
      }
    }

    static now() {
      return NOW.getTime()
    }
  } as DateConstructor
})

function record(name: string, result: boolean, state: StateFile) {
  const recording: Recording = {
    requests,
    logs,
    result,
    state: JSON.parse(JSON.stringify(state)),
  }
  actual[name] = recording
  if (UPDATE) return
  assert.ok(expected[name], `missing snapshot "${name}"`)
  assert.deepEqual(recording, expected[name])
  // Byte-for-byte body check on top of the structural comparison.
  assert.deepEqual(
    recording.requests.map((request) => request.body),
    expected[name].requests.map((request) => request.body)
  )
}

// Weekly from Oct 1, six episodes: episode 4 drops Oct 22 15:00Z (after NOW).
const finiteShow: Show = {
  id: 'frieren',
  title: 'Frieren',
  provider: 'crunchyroll',
  seriesId: 'GG5H5XQX4',
  crunchyrollUrl: 'https://www.crunchyroll.com/series/GG5H5XQX4/frieren',
  schedule: {
    mode: 'finite',
    startAt: '2026-10-01T15:00:00.000Z',
    startEpisode: 1,
    episodeCount: 6,
    premiereBatchSize: 1,
  },
}

const ongoingShow: Show = {
  id: 'one-piece',
  title: '',
  provider: 'netflix',
  netflixUrl: 'https://www.netflix.com/title/80107103',
  schedule: {
    mode: 'ongoing',
    startAt: '2026-10-11T01:30:00.000Z',
    startEpisode: 1,
    episodeCount: null,
    premiereBatchSize: 2,
  },
}

const EP4 = '2026-10-22T15:00:00.000Z'
const EP5 = '2026-10-29T15:00:00.000Z'
const EP6 = '2026-11-05T15:00:00.000Z'

function baseState(overrides: Partial<ShowState> = {}): ShowState {
  return {
    lastEpisodeId: 'cr-3',
    lastEpisodeNumber: '3',
    lastEpisodeTitle: 'Episode 3',
    lastNotifiedAt: '2026-10-15T15:05:00.000Z',
    seasonId: 'season-1',
    seasonTitle: 'Season 1',
    ...overrides,
  }
}

function event(showId: string, episode: number, startAt: string): FakeEvent {
  return {
    id: `listed-${showId}-${episode}-${startAt.slice(5, 10)}`,
    start: { dateTime: startAt },
    extendedProperties: {
      private: {
        animeEpCheckerShowId: showId,
        animeEpCheckerEpisode: String(episode),
      },
    },
  }
}

async function sync(
  name: string,
  shows: Show[],
  state: StateFile,
  dryRun = false
) {
  const result = await syncGoogleCalendarEvents({
    config: CONFIG,
    shows,
    state,
    now: NOW,
    dryRun,
  })
  record(name, result, state)
}

test('sync without calendar config does nothing', async () => {
  const state: StateFile = { shows: {} }
  const result = await syncGoogleCalendarEvents({
    config: { calendarId: 'anime' },
    shows: [finiteShow],
    state,
    now: NOW,
  })
  assert.equal(result, false)
  assert.deepEqual(requests, [])
  assert.deepEqual(state, { shows: {} })
})

test('pre-baseline show syncs listed events without storing them', async () => {
  calendarEvents = [
    event('frieren', 2, '2026-10-08T15:00:00.000Z'),
    event('frieren', 5, EP5),
    event('frieren', 6, '2026-11-05T16:00:00.000Z'),
    event('other-show', 4, EP4),
  ]
  await sync('pre-baseline', [finiteShow], { shows: {} })
  assert.equal(titleLookups, 0)
})

test('pre-baseline dry run lists nothing and would create every event', async () => {
  calendarEvents = [event('frieren', 5, EP5)]
  await sync('pre-baseline dry run', [finiteShow], { shows: {} }, true)
  assert.equal(titleLookups, 0)
})

test('normal show with no events creates them with episode titles', async () => {
  await sync('creates', [finiteShow], {
    shows: { frieren: baseState() },
  })
  // Episodes 4 and 5 have Crunchyroll titles, 6 does not.
  assert.equal(titleLookups, 3)
})

test('ongoing show creates only the next drop', async () => {
  await sync('ongoing', [ongoingShow], {
    shows: {
      'one-piece': baseState({ lastEpisodeNumber: '3', seasonId: '' }),
    },
  })
  assert.equal(titleLookups, 0)
})

test('existing events at the right time are left alone', async () => {
  calendarEvents = [
    event('frieren', 4, EP4),
    event('frieren', 5, EP5),
    event('frieren', 6, EP6),
  ]
  await sync('unchanged', [finiteShow], {
    shows: {
      frieren: baseState({
        googleCalendarEvents: {
          '4': { eventId: 'stored-4', startAt: EP4 },
          '5': { eventId: 'stored-5', startAt: EP5 },
          '6': { eventId: 'stored-6', startAt: EP6 },
        },
      }),
    },
  })
  // Titles are only looked up for events that are written (was 3).
  assert.equal(titleLookups, 0)
})

test('a rescheduled event is updated and listed events are adopted', async () => {
  calendarEvents = [
    event('frieren', 5, '2026-10-29T16:00:00.000Z'),
    event('frieren', 6, EP6),
  ]
  await sync('updates', [finiteShow], {
    shows: {
      frieren: baseState({
        // Unknown season falls back to the last one, offset maps 4 -> 16.
        seasonId: 'season-9',
        episodeOffset: 12,
        googleCalendarEvents: {
          '4': { eventId: 'stored-4', startAt: '2026-10-22T14:00:00.000Z' },
        },
      }),
    },
  })
  // Only the two updated events need a title; episode 6 is adopted (was 3).
  assert.equal(titleLookups, 2)
})

test('stale events for past and removed episodes are deleted', async () => {
  calendarEvents = [
    event('frieren', 3, '2026-10-15T15:00:00.000Z'),
    event('frieren', 4, EP4),
    event('frieren', 9, '2026-11-26T15:00:00.000Z'),
  ]
  await sync('deletes', [finiteShow], {
    shows: {
      frieren: baseState({
        googleCalendarEvents: {
          '2': { eventId: 'stored-2', startAt: '2026-10-08T15:00:00.000Z' },
          '4': { eventId: 'stored-4', startAt: EP4 },
          '5': { eventId: 'stored-5', startAt: EP5 },
          '6': { eventId: 'stored-6', startAt: EP6 },
          '9': {
            eventId: 'listed-frieren-9-11-26',
            startAt: '2026-11-26T15:00:00.000Z',
          },
        },
      }),
    },
  })
  // Nothing is written, so no titles are looked up (was 3).
  assert.equal(titleLookups, 0)
})

test('a finished schedule deletes every event and clears state', async () => {
  calendarEvents = [event('frieren', 6, EP6)]
  await sync('finished', [finiteShow], {
    shows: {
      frieren: baseState({
        lastEpisodeNumber: '6',
        googleCalendarEvents: {
          '6': { eventId: 'listed-frieren-6-11-05', startAt: EP6 },
        },
      }),
    },
  })
  assert.equal(titleLookups, 0)
})

test('dry run logs planned changes without writing', async () => {
  calendarEvents = [event('frieren', 2, '2026-10-08T15:00:00.000Z')]
  await sync(
    'dry run',
    [finiteShow],
    {
      shows: {
        frieren: baseState({
          googleCalendarEvents: {
            '2': { eventId: 'stored-2', startAt: '2026-10-08T15:00:00.000Z' },
            '4': { eventId: 'stored-4', startAt: EP4 },
            '5': { eventId: 'stored-5', startAt: '2026-10-29T14:00:00.000Z' },
          },
        }),
      },
    },
    true
  )
  // A dry run writes nothing, so no titles are looked up (was 3).
  assert.equal(titleLookups, 0)
})

test('a failed write warns and leaves stored events untouched', async () => {
  failCreate = true
  await sync('create fails', [finiteShow, ongoingShow], {
    shows: {
      frieren: baseState({
        googleCalendarEvents: {
          '2': { eventId: 'stored-2', startAt: '2026-10-08T15:00:00.000Z' },
        },
      }),
    },
  })
  assert.equal(titleLookups, 1)
})

test('clearing an episode deletes its stored event', async () => {
  const state: StateFile = {
    shows: {
      frieren: baseState({
        googleCalendarEvents: { '4': { eventId: 'stored-4', startAt: EP4 } },
      }),
    },
  }
  const result = await clearGoogleCalendarEventForEpisode(
    CONFIG,
    'frieren',
    4,
    state
  )
  record('clear episode stored', result, state)
})

test('clearing an episode without a stored event deletes the listed one', async () => {
  calendarEvents = [event('frieren', 4, EP4), event('frieren', 5, EP5)]
  const state: StateFile = {
    shows: {
      frieren: baseState({
        googleCalendarEvents: { '5': { eventId: 'stored-5', startAt: EP5 } },
      }),
    },
  }
  const result = await clearGoogleCalendarEventForEpisode(
    CONFIG,
    'frieren',
    4,
    state
  )
  record('clear episode listed', result, state)
})

test('clearing an episode with no event reports nothing cleared', async () => {
  const state: StateFile = { shows: { frieren: baseState() } }
  const result = await clearGoogleCalendarEventForEpisode(
    CONFIG,
    'frieren',
    4,
    state
  )
  record('clear episode missing', result, state)
})

test('clearing a show deletes stored and listed events', async () => {
  calendarEvents = [event('frieren', 4, EP4), event('frieren', 5, EP5)]
  const state: StateFile = {
    shows: {
      frieren: baseState({
        googleCalendarEvents: {
          '4': { eventId: 'listed-frieren-4-10-22', startAt: EP4 },
          '6': { eventId: 'stored-6', startAt: EP6 },
        },
      }),
    },
  }
  const result = await clearGoogleCalendarEventsForShow(
    CONFIG,
    'frieren',
    state
  )
  record('clear show', result, state)
})

test('clearing a show on a dry run only logs stored events', async () => {
  calendarEvents = [event('frieren', 4, EP4)]
  const state: StateFile = {
    shows: {
      frieren: baseState({
        googleCalendarEvents: { '6': { eventId: 'stored-6', startAt: EP6 } },
      }),
    },
  }
  const result = await clearGoogleCalendarEventsForShow(
    CONFIG,
    'frieren',
    state,
    true
  )
  record('clear show dry run', result, state)
})

test('clearing an untracked show with no events does nothing', async () => {
  const state: StateFile = { shows: {} }
  const result = await clearGoogleCalendarEventsForShow(
    CONFIG,
    'frieren',
    state
  )
  record('clear show missing', result, state)
})
