import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { installFakeGitHub } from './fake-github'
import { fetchMalAnimeDetails, fetchPlanToWatchList } from './mal'
import { syncShowsWithMal } from './sync-mal'
import type { Show } from '@shared/types'

// The MAL client caches its access token per module, so the cold-start test
// must run first in this file.

const realFetch = globalThis.fetch
let malRequests: string[]

function show(id: string, malId: number): Show {
  return {
    id,
    title: id,
    provider: 'crunchyroll',
    malId,
    schedule: {
      mode: 'ongoing',
      startAt: '2026-10-01T15:00:00.000Z',
      startEpisode: 1,
      episodeCount: null,
      premiereBatchSize: 1,
    },
  }
}

function fakeMal(url: URL): Response {
  malRequests.push(url.pathname)

  if (url.pathname === '/v1/oauth2/token') {
    return Response.json({ access_token: 'access', expires_in: 3600 })
  }

  const anime = /^\/v2\/anime\/(\d+)$/.exec(url.pathname)
  if (anime) {
    const id = Number(anime[1])
    return Response.json({
      id,
      title: `Title ${id}`,
      num_episodes: 12,
      my_list_status: { num_episodes_watched: id },
    })
  }

  if (url.pathname === '/v2/users/@me/animelist') {
    return Response.json({
      data: [
        {
          node: {
            id: 7,
            title: 'Planned',
            status: 'not_yet_aired',
            synopsis: 'A synopsis',
            mean: 8.1,
          },
          list_status: { updated_at: '2026-10-01T00:00:00Z' },
        },
      ],
    })
  }

  return new Response('not found', { status: 404 })
}

beforeEach(() => {
  process.env.MAL_CLIENT_ID = 'client'
  process.env.MAL_CLIENT_SECRET = 'secret'
  process.env.MAL_REFRESH_TOKEN = 'refresh'
  malRequests = []
  const github = installFakeGitHub({
    'shows.json': { shows: [show('frieren', 1), show('dandadan', 2)] },
    'state.json': { shows: {} },
  })
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    if (url.hostname.endsWith('myanimelist.net')) return fakeMal(url)
    return github.handle(input as string, init)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

test('concurrent requests on a cold start share one token refresh', async () => {
  await Promise.all([fetchMalAnimeDetails(1), fetchMalAnimeDetails(2)])

  assert.equal(
    malRequests.filter((path) => path === '/v1/oauth2/token').length,
    1
  )
})

test('MAL sync makes one anime request per show and returns watched counts', async () => {
  const result = await syncShowsWithMal()

  assert.deepEqual(
    malRequests.filter((path) => path.startsWith('/v2/anime/')).sort(),
    ['/v2/anime/1', '/v2/anime/2']
  )
  assert.deepEqual(result.watchedByShowId, { frieren: 1, dandadan: 2 })
  assert.equal(result.malDown, false)
})

test('a plan-to-watch refresh fetches the MAL list once for snapshot and details', async () => {
  const result = await fetchPlanToWatchList()

  assert.deepEqual(malRequests, ['/v2/users/@me/animelist'])
  assert.equal(result.status, 'ok')
  if (result.status !== 'ok') return
  assert.deepEqual(
    result.entries.map((entry) => entry.malId),
    [7]
  )
  assert.equal(result.details[0].synopsis, 'A synopsis')
  assert.equal(result.details[0].addedAt, '2026-10-01T00:00:00Z')
})
