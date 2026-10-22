import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  needsAiringScheduleRefresh,
  refreshAiringSchedule,
} from './airing-schedule.ts'
import { fetchAnilistAiring } from './anilist.ts'
import type { Show, ShowState } from '../shared/types.ts'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const SHOW: Show = {
  id: 'frieren',
  title: 'Frieren',
  provider: 'crunchyroll',
  malId: 52991,
  schedule: {
    mode: 'finite',
    startAt: '2026-09-01T15:00:00.000Z',
    startEpisode: 1,
    episodeCount: 3,
    premiereBatchSize: 1,
  },
}

const STATE: ShowState = {
  lastEpisodeId: 'ep-1',
  lastEpisodeNumber: '1',
  lastEpisodeTitle: '',
  lastNotifiedAt: '2026-09-01T15:00:00.000Z',
  seasonId: 's',
  seasonTitle: 'Season 1',
}

const SAVED = {
  fetchedAt: '2026-09-03T12:00:00.000Z',
  episodes: { '1': '2026-09-01T14:00:00.000Z' },
}

/** Serves AniList pages of nodes; records the requested page numbers. */
function stubAnilist(
  pages: Array<Array<{ episode: number; airingAt: number }>>
) {
  const requested: number[] = []
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const page = JSON.parse(String(init?.body)).variables.page as number
    requested.push(page)
    return Response.json({
      data: {
        Media: {
          title: { romaji: 'Sousou no Frieren' },
          airingSchedule: {
            pageInfo: { hasNextPage: page < pages.length },
            nodes: pages[page - 1],
          },
        },
      },
    })
  }) as typeof fetch
  return requested
}

test('the AniList schedule is read across pages', async () => {
  const requested = stubAnilist([
    [{ episode: 1, airingAt: 100 }],
    [{ episode: 2, airingAt: 200 }],
  ])
  assert.deepEqual(await fetchAnilistAiring(52991), {
    seriesTitle: 'Sousou no Frieren',
    nodes: [
      { episode: 1, airingAt: 100 },
      { episode: 2, airingAt: 200 },
    ],
  })
  assert.deepEqual(requested, [1, 2])
})

test('the AniList schedule stops after four pages', async () => {
  const requested = stubAnilist(
    Array.from({ length: 6 }, (_, index) => [
      { episode: index + 1, airingAt: 1 },
    ])
  )
  const airing = await fetchAnilistAiring(52991)
  assert.equal(airing?.nodes.length, 4)
  assert.deepEqual(requested, [1, 2, 3, 4])
})

test('refresh is due without a saved schedule, after a day, or in the drop window', () => {
  // 22 hours after the saved fetch.
  const now = new Date('2026-09-04T10:00:00.000Z')
  assert.equal(needsAiringScheduleRefresh(SHOW, STATE, now), true)
  assert.equal(
    needsAiringScheduleRefresh(SHOW, { ...STATE, airingSchedule: SAVED }, now),
    false
  )
  assert.equal(
    needsAiringScheduleRefresh(
      SHOW,
      { ...STATE, airingSchedule: SAVED },
      new Date('2026-09-04T11:00:00.000Z')
    ),
    true
  )
  assert.equal(
    needsAiringScheduleRefresh(
      SHOW,
      { ...STATE, airingSchedule: SAVED },
      new Date('2026-09-08T15:00:00.000Z')
    ),
    true
  )
  assert.equal(
    needsAiringScheduleRefresh({ ...SHOW, malId: undefined }, STATE, now),
    false
  )
})

test('a refresh keeps scheduled episodes and reports changed times', async () => {
  stubAnilist([
    [
      { episode: 1, airingAt: Date.parse('2026-09-01T14:00:00.000Z') / 1000 },
      { episode: 2, airingAt: Date.parse('2026-09-15T14:00:00.000Z') / 1000 },
      { episode: 4, airingAt: Date.parse('2026-09-29T14:00:00.000Z') / 1000 },
    ],
  ])
  const result = await refreshAiringSchedule({
    show: SHOW,
    showState: { ...STATE, airingSchedule: SAVED },
    now: new Date('2026-09-08T15:00:00.000Z'),
  })
  assert.deepEqual(result, {
    airingSchedule: {
      fetchedAt: '2026-09-08T15:00:00.000Z',
      episodes: {
        '1': '2026-09-01T14:00:00.000Z',
        '2': '2026-09-15T14:00:00.000Z',
      },
    },
    episodesChanged: true,
  })

  const unchanged = await refreshAiringSchedule({
    show: SHOW,
    showState: { ...STATE, airingSchedule: result.airingSchedule! },
    now: new Date('2026-09-09T16:00:00.000Z'),
  })
  assert.equal(unchanged.episodesChanged, false)
})

test('a failed refresh keeps the saved schedule', async () => {
  globalThis.fetch = (async () =>
    new Response('busy', { status: 500 })) as typeof fetch
  const failing = await refreshAiringSchedule({
    show: SHOW,
    showState: { ...STATE, airingSchedule: SAVED },
    now: new Date('2026-09-08T15:00:00.000Z'),
  })
  assert.deepEqual(failing, { airingSchedule: SAVED, episodesChanged: false })

  const throwing = await refreshAiringSchedule({
    show: SHOW,
    showState: STATE,
    now: new Date('2026-09-08T15:00:00.000Z'),
    fetchAiring: async () => {
      throw new Error('socket hang up')
    },
  })
  assert.deepEqual(throwing, { airingSchedule: null, episodesChanged: false })
})
