import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { checkShows, type CheckOptions } from './check.js'
import type { EpisodeSnapshot, Show, ShowState, StateFile } from './types.js'

const WEBHOOK_URL = 'https://discord.test/webhook'

let alerts: string[]
const realFetch = globalThis.fetch

beforeEach(() => {
  alerts = []
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith(WEBHOOK_URL)) {
      alerts.push(JSON.parse(String(init?.body)).embeds[0].title)
      return new Response(null, { status: 204 })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

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
