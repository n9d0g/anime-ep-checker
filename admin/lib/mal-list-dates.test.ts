import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { completeMalAnime, setMalWatchedEpisode } from './mal'

const realFetch = globalThis.fetch

// 10:30 PM Eastern on Nov 6, already Nov 7 in UTC.
const LATE_EVENING_ET = new Date('2026-11-07T03:30:00Z')

interface ListStatus {
  num_episodes_watched?: number
  start_date?: string
  finish_date?: string
}

let listStatus: ListStatus
let patches: Array<Record<string, string>>

beforeEach(() => {
  process.env.MAL_CLIENT_ID = 'client'
  process.env.MAL_CLIENT_SECRET = 'secret'
  process.env.MAL_REFRESH_TOKEN = 'refresh'
  patches = []
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (url.pathname === '/v1/oauth2/token') {
      return Response.json({ access_token: 'access', expires_in: 3600 })
    }
    if (url.pathname === '/v2/anime/1/my_list_status') {
      patches.push(
        Object.fromEntries(new URLSearchParams(String(init?.body)).entries())
      )
      return Response.json({})
    }
    if (url.pathname === '/v2/anime/1') {
      return Response.json({
        id: 1,
        num_episodes: 12,
        my_list_status: listStatus,
      })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

test('watching the first episode sets Started to the Eastern day', async () => {
  listStatus = { num_episodes_watched: 0 }

  await setMalWatchedEpisode(1, 1, LATE_EVENING_ET)

  assert.equal(patches[0].start_date, '2026-11-06')
})

test('watching the first episode keeps a Started already on MAL', async () => {
  listStatus = { num_episodes_watched: 0, start_date: '2026-10-01' }

  await setMalWatchedEpisode(1, 1, LATE_EVENING_ET)

  assert.equal(patches[0].start_date, undefined)
})

test('later episodes leave Started alone', async () => {
  listStatus = { num_episodes_watched: 3 }

  await setMalWatchedEpisode(1, 4, LATE_EVENING_ET)

  assert.equal(patches[0].start_date, undefined)
})

test('completing a show sets a blank finish date to the Eastern day', async () => {
  listStatus = { num_episodes_watched: 11, start_date: '2026-10-01' }

  await completeMalAnime(1, 8, LATE_EVENING_ET)

  assert.equal(patches[0].finish_date, '2026-11-06')
  assert.equal(patches[0].start_date, undefined)
})

test('completing a show keeps a finish date already on MAL', async () => {
  listStatus = {
    num_episodes_watched: 12,
    start_date: '2026-10-01',
    finish_date: '2026-11-01',
  }

  await completeMalAnime(1, 8, LATE_EVENING_ET)

  assert.equal(patches[0].finish_date, undefined)
})

test('completing a show never started sets Started and finish to the same day', async () => {
  listStatus = { num_episodes_watched: 0 }

  await completeMalAnime(1, 8, LATE_EVENING_ET)

  assert.equal(patches[0].start_date, '2026-11-06')
  assert.equal(patches[0].finish_date, '2026-11-06')
})
