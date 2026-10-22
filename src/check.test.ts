import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, mock, test } from 'node:test'
import { checkShows, type CheckOptions } from './check.ts'
import { resetDisneyAuthForRun } from './disney.ts'
import { NetflixAuthError } from './netflix.ts'
import type { EpisodeSnapshot } from './types.ts'
import type { Show, ShowState, StateFile } from '../shared/types.ts'

const WEBHOOK_URL = 'https://discord.test/webhook'
const DISCORD_BOT_MESSAGES = 'https://discord.com/api/v10/channels/'
const ANILIST_URL = 'https://graphql.anilist.co'

let alerts: string[]
/** AniList airing schedule served by the stubbed fetch. */
let anilistNodes: Array<{ episode: number; airingAt: number }>
const realFetch = globalThis.fetch

beforeEach(() => {
  alerts = []
  anilistNodes = []
  process.env.NODE_ENV = 'test'
  delete process.env.DISNEY_REFRESH_TOKEN
  resetDisneyAuthForRun()
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith(WEBHOOK_URL)) {
      alerts.push(JSON.parse(String(init?.body)).embeds[0].title)
      return new Response(null, { status: 204 })
    }
    if (url.startsWith(DISCORD_BOT_MESSAGES) && init?.method === 'POST') {
      alerts.push(JSON.parse(String(init.body)).embeds[0].title)
      return Response.json({ id: 'message-1' })
    }
    if (url === ANILIST_URL) {
      return Response.json({
        data: {
          Media: {
            title: { romaji: 'AniList Title' },
            airingSchedule: { nodes: anilistNodes },
          },
        },
      })
    }
    if (url.endsWith('/token')) {
      return Response.json({ access_token: 'access', expires_in: 3600 })
    }
    if (url.includes('/explore/')) {
      return Response.json({ data: { page: { containers: [] } } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  mock.timers.reset()
})

/** Freezes `new Date()` for the run (timers stay real). */
function freezeNow(iso: string) {
  mock.timers.enable({ apis: ['Date'], now: new Date(iso) })
}

function makeShow(id: string): Show {
  return {
    id,
    title: id,
    provider: 'crunchyroll',
    seriesId: `series-${id}`,
    crunchyrollUrl: `https://www.crunchyroll.com/series/series-${id}`,
    schedule: {
      mode: 'ongoing',
      startAt: '2026-09-01T15:00:00.000Z',
      startEpisode: 1,
      episodeCount: null,
      premiereBatchSize: 1,
    },
  }
}

function showState(episode: number): ShowState {
  return {
    lastEpisodeId: `ep-${episode}`,
    lastEpisodeNumber: String(episode),
    lastEpisodeTitle: `Episode ${episode}`,
    lastNotifiedAt: '2026-10-15T15:00:00.000Z',
    seasonId: 'season-1',
    seasonTitle: 'Season 1',
    episodeOffset: 0,
  }
}

function snapshot(show: Show, episode: number): EpisodeSnapshot {
  return {
    provider: 'crunchyroll',
    seriesId: show.seriesId!,
    seriesTitle: show.title,
    seasonId: 'season-1',
    seasonTitle: 'Season 1',
    episode: {
      id: `ep-${episode}`,
      episode: String(episode),
      title: `Episode ${episode}`,
    },
    watchUrl: `https://www.crunchyroll.com/watch/ep-${episode}`,
  }
}

async function setup(shows: Show[], state: StateFile) {
  const dir = await mkdtemp(join(tmpdir(), 'check-test-'))
  const showsPath = join(dir, 'shows.json')
  const statePath = join(dir, 'state.json')
  await writeFile(showsPath, JSON.stringify({ shows }))
  await writeFile(statePath, JSON.stringify(state))

  const run = (options: Partial<CheckOptions> = {}) =>
    checkShows({
      showsPath,
      statePath,
      discord: { webhookUrl: WEBHOOK_URL },
      calendar: {},
      force: true,
      ...options,
    })
  const savedState = async () =>
    JSON.parse(await readFile(statePath, 'utf8')) as StateFile

  return { run, savedState }
}

test('alerts each show with a new episode and records it in state', async () => {
  const frieren = makeShow('frieren')
  const dandadan = makeShow('dandadan')
  const { run, savedState } = await setup([frieren, dandadan], {
    shows: { frieren: showState(2), dandadan: showState(5) },
  })

  await run({
    fetchEpisode: async (show) =>
      show.id === 'frieren' ? snapshot(frieren, 3) : snapshot(dandadan, 6),
  })

  assert.deepEqual(alerts, [
    '✅ frieren — Episode 3 is out!',
    '✅ dandadan — Episode 6 is out!',
  ])
  const state = await savedState()
  assert.equal(state.shows.frieren.lastEpisodeNumber, '3')
  assert.equal(state.shows.dandadan.lastEpisodeNumber, '6')
})

test('keeps checking other shows when one provider call throws', async () => {
  const frieren = makeShow('frieren')
  const dandadan = makeShow('dandadan')
  const { run, savedState } = await setup([frieren, dandadan], {
    shows: { frieren: showState(2), dandadan: showState(5) },
  })
  const fetchEpisode = async (show: Show) => {
    if (show.id === 'frieren') throw new Error('Crunchyroll 503')
    return snapshot(dandadan, 6)
  }

  const result = await run({ fetchEpisode })

  assert.deepEqual(result.failedShows, ['frieren'])
  assert.deepEqual(alerts, ['✅ dandadan — Episode 6 is out!'])
  const state = await savedState()
  assert.equal(state.shows.frieren.lastEpisodeNumber, '2')
  assert.equal(state.shows.dandadan.lastEpisodeNumber, '6')

  alerts = []
  await run({ fetchEpisode })
  const episodeAlerts = alerts.filter((alert) => alert.includes('is out'))
  assert.deepEqual(episodeAlerts, [])
})

test('records the episode when clearing its calendar entry fails', async () => {
  const frieren = makeShow('frieren')
  const { run, savedState } = await setup([frieren], {
    shows: {
      frieren: {
        ...showState(2),
        googleCalendarEvents: {
          '3': { eventId: 'event-3', startAt: '2026-09-15T15:00:00.000Z' },
        },
      },
    },
  })

  const result = await run({
    calendar: { serviceAccountJson: 'not json', calendarId: 'calendar' },
    fetchEpisode: async () => snapshot(frieren, 3),
  })

  assert.deepEqual(result.failedShows, [])
  assert.deepEqual(alerts, ['✅ frieren — Episode 3 is out!'])
  assert.equal((await savedState()).shows.frieren.lastEpisodeNumber, '3')
})

test('recording a new episode keeps the rest of the show state', async () => {
  const frieren = makeShow('frieren')
  const calendarEvent = {
    eventId: 'event-4',
    startAt: '2026-10-22T15:00:00.000Z',
  }
  const { run, savedState } = await setup([frieren], {
    shows: {
      frieren: {
        ...showState(2),
        waitingNotifiedForEpisode: 3,
        malMeanScore: 9.1,
        malScoreAlertedAt: '2026-10-01T00:00:00.000Z',
        discussionUrl: 'https://www.reddit.com/r/anime/comments/abc/',
        discussionUrlEpisode: 2,
        googleCalendarEvents: { '4': calendarEvent },
      },
    },
  })

  await run({ fetchEpisode: async () => snapshot(frieren, 3) })

  const saved = (await savedState()).shows.frieren
  assert.notEqual(saved.lastNotifiedAt, showState(2).lastNotifiedAt)
  assert.deepEqual(saved, {
    lastEpisodeId: 'ep-3',
    lastEpisodeNumber: '3',
    lastEpisodeTitle: 'Episode 3',
    lastNotifiedAt: saved.lastNotifiedAt,
    seasonId: 'season-1',
    seasonTitle: 'Season 1',
    episodeOffset: 0,
    waitingNotifiedForEpisode: null,
    lastSnapshotEpisode: 3,
    malMeanScore: 9.1,
    malScoreAlertedAt: '2026-10-01T00:00:00.000Z',
    discussionUrl: 'https://www.reddit.com/r/anime/comments/abc/',
    discussionUrlEpisode: 2,
    googleCalendarEvents: { '4': calendarEvent },
  })
})

test('remembers the episode of the latest snapshot for each checked show', async () => {
  const frieren = makeShow('frieren')
  const { run, savedState } = await setup([frieren], {
    shows: { frieren: showState(2) },
  })

  await run({ fetchEpisode: async () => snapshot(frieren, 2) })

  assert.equal((await savedState()).shows.frieren.lastSnapshotEpisode, 2)
})

// ---------------------------------------------------------------------------
// Recorded behaviour for each per-show decision branch.
// ---------------------------------------------------------------------------

/** Episode 3 of makeShow's schedule is expected at this time. */
const EP3_EXPECTED_AT = '2026-09-15T15:00:00.000Z'

function fetchCounter(
  fetchEpisode: (show: Show) => Promise<EpisodeSnapshot | null>
) {
  const fetched: string[] = []
  return {
    fetched,
    fetchEpisode: async (show: Show) => {
      fetched.push(show.id)
      return fetchEpisode(show)
    },
  }
}

test('first sight of a show alerts the snapshot episode as a catch-up', async () => {
  const frieren = makeShow('frieren')
  const { run, savedState } = await setup([frieren], { shows: {} })

  await run({
    fetchEpisode: async () => ({
      ...snapshot(frieren, 3),
      seasonEpisodes: [1, 2, 3].map((episode) => ({
        episode,
        availableAt: '2026-09-01T15:00:00.000Z',
        available: true,
      })),
    }),
  })

  assert.deepEqual(alerts, ['✅ frieren — Episode 3 is out!'])
  const saved = (await savedState()).shows.frieren
  assert.equal(saved.lastEpisodeNumber, '3')
  assert.equal(saved.lastEpisodeId, 'ep-3')
  assert.equal(saved.episodeOffset, 0)
  assert.equal(saved.waitingNotifiedForEpisode, null)
  assert.equal(saved.lastSnapshotEpisode, 3)
})

test('first sight without season episodes counts from the start episode', async () => {
  const frieren = makeShow('frieren')
  const { run, savedState } = await setup([frieren], { shows: {} })

  await run({ fetchEpisode: async () => snapshot(frieren, 3) })

  // The provider's episode 3 becomes the season's episode 1 (offset 2).
  assert.deepEqual(alerts, ['✅ frieren — Episode 1 is out!'])
  const saved = (await savedState()).shows.frieren
  assert.equal(saved.lastEpisodeNumber, '1')
  assert.equal(saved.episodeOffset, 2)
  assert.equal(saved.lastSnapshotEpisode, 1)
})

test('first sight of only last season records a previous-season baseline', async () => {
  const frieren = makeShow('frieren')
  const { run, savedState } = await setup([frieren], { shows: {} })

  await run({
    fetchEpisode: async () => ({
      ...snapshot(frieren, 12),
      episode: {
        ...snapshot(frieren, 12).episode,
        availableAt: '2026-06-01T15:00:00.000Z',
      },
    }),
  })

  assert.deepEqual(alerts, [])
  const saved = (await savedState()).shows.frieren
  assert.deepEqual(saved, {
    lastEpisodeId: 'previous-season',
    lastEpisodeNumber: '0',
    lastEpisodeTitle: '',
    lastNotifiedAt: saved.lastNotifiedAt,
    seasonId: '',
    seasonTitle: '',
    waitingNotifiedForEpisode: null,
  })
})

test('a tracked show still on last season stays unchanged without a waiting alert', async () => {
  const frieren = makeShow('frieren')
  const previousSeason: ShowState = {
    lastEpisodeId: 'previous-season',
    lastEpisodeNumber: '0',
    lastEpisodeTitle: '',
    lastNotifiedAt: '2026-08-01T00:00:00.000Z',
    seasonId: '',
    seasonTitle: '',
    waitingNotifiedForEpisode: null,
  }
  const { run, savedState } = await setup([frieren], {
    shows: { frieren: previousSeason },
  })

  const result = await run({
    fetchEpisode: async () => ({
      ...snapshot(frieren, 12),
      episode: {
        ...snapshot(frieren, 12).episode,
        availableAt: '2026-06-01T15:00:00.000Z',
      },
    }),
  })

  assert.equal(result.stateChanged, false)
  assert.deepEqual(alerts, [])
  assert.deepEqual((await savedState()).shows.frieren, previousSeason)
})

test('a new episode for a tracked show alerts the next drop', async () => {
  const frieren = makeShow('frieren')
  const { run, savedState } = await setup([frieren], {
    shows: { frieren: showState(2) },
  })

  // Even when the provider is two episodes ahead, only the next drop is sent.
  await run({ fetchEpisode: async () => snapshot(frieren, 4) })

  assert.deepEqual(alerts, ['✅ frieren — Episode 3 is out!'])
  const saved = (await savedState()).shows.frieren
  assert.equal(saved.lastEpisodeNumber, '3')
  assert.equal(saved.lastEpisodeId, 'ep-4')
  assert.equal(saved.lastSnapshotEpisode, 4)
})

test('a late episode gets one still-waiting alert', async () => {
  const frieren = makeShow('frieren')
  const { run, savedState } = await setup([frieren], {
    shows: { frieren: showState(2) },
  })
  const fetchEpisode = async () => snapshot(frieren, 2)

  await run({ fetchEpisode })

  assert.deepEqual(alerts, ['🤔 frieren — Episode 3 not on Crunchyroll yet.'])
  const saved = (await savedState()).shows.frieren
  assert.deepEqual(saved, {
    ...showState(2),
    waitingNotifiedForEpisode: 3,
    lastSnapshotEpisode: 2,
  })

  alerts = []
  const second = await run({ fetchEpisode })
  assert.deepEqual(alerts, [])
  assert.equal(second.stateChanged, false)
})

test('no still-waiting alert inside the grace period', async () => {
  // 10 minutes after episode 3's expected drop.
  freezeNow('2026-09-15T15:10:00.000Z')
  const frieren = makeShow('frieren')
  const { run, savedState } = await setup([frieren], {
    shows: { frieren: { ...showState(2), lastSnapshotEpisode: 2 } },
  })

  const result = await run({
    force: false,
    fetchEpisode: async () => snapshot(frieren, 2),
  })

  assert.deepEqual(alerts, [])
  assert.equal(result.stateChanged, false)
  assert.equal(
    (await savedState()).shows.frieren.waitingNotifiedForEpisode,
    undefined
  )
})

test('a show past its last scheduled episode is not looked up', async () => {
  const frieren = makeShow('frieren')
  frieren.schedule = { ...frieren.schedule, mode: 'finite', episodeCount: 2 }
  const { run } = await setup([frieren], { shows: { frieren: showState(2) } })
  const counter = fetchCounter(async () => snapshot(frieren, 3))

  const result = await run({ fetchEpisode: counter.fetchEpisode })

  assert.deepEqual(counter.fetched, [])
  assert.deepEqual(alerts, [])
  assert.equal(result.stateChanged, false)
})

test('outside the drop window a show is not looked up unless forced', async () => {
  // A day before episode 3's expected drop.
  freezeNow('2026-09-14T15:00:00.000Z')
  const frieren = makeShow('frieren')
  const { run } = await setup([frieren], { shows: { frieren: showState(2) } })
  const counter = fetchCounter(async () => snapshot(frieren, 2))

  await run({ force: false, fetchEpisode: counter.fetchEpisode })
  assert.deepEqual(counter.fetched, [])

  await run({ force: true, fetchEpisode: counter.fetchEpisode })
  assert.deepEqual(counter.fetched, ['frieren'])
})

test('inside the drop window a show is looked up and alerted', async () => {
  freezeNow(EP3_EXPECTED_AT)
  const frieren = makeShow('frieren')
  const { run, savedState } = await setup([frieren], {
    shows: { frieren: showState(2) },
  })

  await run({ force: false, fetchEpisode: async () => snapshot(frieren, 3) })

  assert.deepEqual(alerts, ['✅ frieren — Episode 3 is out!'])
  assert.equal((await savedState()).shows.frieren.lastEpisodeNumber, '3')
})

test('an AniList break moves the drop window and is saved once', async () => {
  const hour = 3600
  const firstAiring = Date.parse('2026-09-01T14:00:00.000Z') / 1000
  // Japan airs an hour before the configured drop and breaks a week after
  // episode 2.
  anilistNodes = [1, 2, 3, 4].map((episode) => ({
    episode,
    airingAt: firstAiring + (episode - 1 + (episode > 2 ? 1 : 0)) * 168 * hour,
  }))
  const frieren = { ...makeShow('frieren'), malId: 52991 }
  const { run, savedState } = await setup([frieren], {
    shows: { frieren: showState(2) },
  })
  const counter = fetchCounter(async () => snapshot(frieren, 3))

  // The weekly formula's time for episode 3 is now outside the window.
  freezeNow(EP3_EXPECTED_AT)
  const first = await run({ force: false, fetchEpisode: counter.fetchEpisode })
  assert.deepEqual(counter.fetched, [])
  assert.equal(first.stateChanged, true)
  assert.deepEqual((await savedState()).shows.frieren.airingSchedule, {
    fetchedAt: EP3_EXPECTED_AT,
    episodes: {
      '1': '2026-09-01T14:00:00.000Z',
      '2': '2026-09-08T14:00:00.000Z',
      '3': '2026-09-22T14:00:00.000Z',
      '4': '2026-09-29T14:00:00.000Z',
    },
  })

  // Same times within the day: nothing to commit (a day-old schedule is
  // re-saved once, see shouldSaveAiringSchedule).
  mock.timers.setTime(Date.parse('2026-09-16T03:00:00.000Z'))
  const second = await run({ force: false, fetchEpisode: counter.fetchEpisode })
  assert.equal(second.stateChanged, false)

  // A week later, the shifted drop is looked up and alerted.
  mock.timers.setTime(Date.parse('2026-09-22T15:00:00.000Z'))
  await run({ force: false, fetchEpisode: counter.fetchEpisode })
  assert.deepEqual(counter.fetched, ['frieren'])
  assert.deepEqual(alerts, ['✅ frieren — Episode 3 is out!'])
})

test('an AniList failure keeps the saved airing schedule', async () => {
  const saved = {
    fetchedAt: '2026-09-01T00:00:00.000Z',
    episodes: { '1': '2026-09-01T14:00:00.000Z' },
  }
  const frieren = { ...makeShow('frieren'), malId: 52991 }
  const { run, savedState } = await setup([frieren], {
    shows: { frieren: { ...showState(2), airingSchedule: saved } },
  })
  const fetchStub = globalThis.fetch
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) =>
    String(input) === ANILIST_URL
      ? new Response('busy', { status: 500 })
      : fetchStub(input, init)) as typeof fetch

  const result = await run({ fetchEpisode: async () => snapshot(frieren, 3) })

  assert.deepEqual(result.failedShows, [])
  assert.deepEqual(alerts, ['✅ frieren — Episode 3 is out!'])
  assert.deepEqual((await savedState()).shows.frieren.airingSchedule, saved)
})

function makeNetflixShow(id: string): Show {
  return {
    ...makeShow(id),
    provider: 'netflix',
    seriesId: undefined,
    crunchyrollUrl: undefined,
    netflixId: `${id}-netflix`,
  }
}

function makeDisneyShow(id: string, malId: number): Show {
  return {
    ...makeShow(id),
    provider: 'disney',
    seriesId: undefined,
    crunchyrollUrl: undefined,
    disneyId: '11111111-1111-1111-1111-111111111111',
    malId,
  }
}

const BOT_DISCORD = { botToken: 'bot-token', channelId: 'channel-1' }

test('a Netflix login failure alerts once and skips the other Netflix shows', async () => {
  const sakamoto = makeNetflixShow('sakamoto')
  const dandadan = makeNetflixShow('dandadan')
  const frieren = makeShow('frieren')
  const { run, savedState } = await setup([sakamoto, dandadan, frieren], {
    shows: {
      sakamoto: showState(2),
      dandadan: showState(2),
      frieren: showState(2),
    },
  })
  const failing = fetchCounter(async (show) => {
    if (show.provider === 'netflix') throw new NetflixAuthError('expired')
    return snapshot(show, 3)
  })

  const first = await run({
    discord: BOT_DISCORD,
    fetchEpisode: failing.fetchEpisode,
  })

  assert.deepEqual(first.failedShows, [])
  assert.deepEqual(failing.fetched, ['sakamoto', 'frieren'])
  assert.deepEqual(alerts, [
    'Netflix cookie needs refresh',
    '✅ frieren — Episode 3 is out!',
  ])
  const flaggedAt = (await savedState()).meta?.netflixCookieAlertSentAt
  assert.ok(flaggedAt)
  assert.equal((await savedState()).shows.sakamoto.lastEpisodeNumber, '2')

  alerts = []
  await run({ discord: BOT_DISCORD, fetchEpisode: failing.fetchEpisode })
  assert.deepEqual(alerts, ['🤔 frieren — Episode 4 not on Crunchyroll yet.'])
  assert.equal((await savedState()).meta?.netflixCookieAlertSentAt, flaggedAt)

  alerts = []
  await run({
    discord: BOT_DISCORD,
    fetchEpisode: async (show) => snapshot(show, 3),
  })
  assert.deepEqual(alerts, [
    '✅ sakamoto — Episode 3 is out!',
    '✅ dandadan — Episode 3 is out!',
  ])
  assert.equal((await savedState()).meta?.netflixCookieAlertSentAt, null)
})

test('a Disney+ login failure falls back to AniList and alerts once', async () => {
  const daredevil = makeDisneyShow('daredevil', 101)
  const bleach = makeDisneyShow('bleach', 202)
  const { run, savedState } = await setup([daredevil, bleach], {
    shows: { daredevil: showState(2), bleach: showState(5) },
  })
  anilistNodes = [{ episode: 3, airingAt: Date.parse(EP3_EXPECTED_AT) / 1000 }]

  const first = await run({ discord: BOT_DISCORD })

  assert.deepEqual(first.failedShows, [])
  assert.deepEqual(alerts, [
    'Disney+ checks need attention',
    '✅ daredevil — Episode 3 is out!',
    // AniList's episode 3 is behind bleach's episode 5.
    '🤔 bleach — Episode 6 not on Disney+ yet.',
  ])
  const state = await savedState()
  assert.ok(state.meta?.disneyCookieAlertSentAt)
  assert.equal(state.shows.daredevil.lastEpisodeNumber, '3')
  assert.equal(state.shows.daredevil.lastEpisodeId, 'anilist-101-3')
  assert.equal(state.shows.bleach.lastEpisodeNumber, '5')

  // Disney+ answers again: the flag clears and AniList still fills the gap.
  alerts = []
  anilistNodes = [
    { episode: 4, airingAt: Date.parse(EP3_EXPECTED_AT) / 1000 + 604_800 },
  ]
  process.env.DISNEY_REFRESH_TOKEN = 'refresh-1'
  resetDisneyAuthForRun()
  await run({ discord: BOT_DISCORD })

  assert.deepEqual(alerts, ['✅ daredevil — Episode 4 is out!'])
  assert.equal((await savedState()).meta?.disneyCookieAlertSentAt, null)
})
