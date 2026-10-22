import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import {
  fetchMalAnimeDetails,
  fetchMalAnimeSummary,
  fetchPlanToWatchAnime,
  fetchRelatedAnime,
  fetchUserAnimeList,
} from './mal.ts'

// Each MAL endpoint keeps its own result shape for the same HTTP outcome:
// only the full-list and related-anime lookups report `rate_limited`.

const realFetch = globalThis.fetch
const realWarn = console.warn
let respond: (url: string) => Response
const requests: Array<{ url: string; auth: string | null }> = []

before(() => {
  process.env.MAL_CLIENT_ID = 'id'
  process.env.MAL_CLIENT_SECRET = 'secret'
  process.env.MAL_REFRESH_TOKEN = 'refresh'
  console.warn = () => {}
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input)
    if (url.includes('oauth2/token')) {
      return Response.json({ access_token: 'token' })
    }
    requests.push({
      url,
      auth: new Headers(init?.headers).get('authorization'),
    })
    return respond(url)
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = realFetch
  console.warn = realWarn
  delete process.env.MAL_CLIENT_ID
  delete process.env.MAL_CLIENT_SECRET
  delete process.env.MAL_REFRESH_TOKEN
})

const failures = [403, 429, 500] as const
let nextMalId = 1000

test('anime details: ok, and any failure is unavailable', async () => {
  respond = () =>
    Response.json({
      num_episodes: 12,
      mean: 8.5,
      main_picture: { medium: 'm.jpg', large: 'l.jpg' },
      my_list_status: { num_episodes_watched: 3 },
    })
  requests.length = 0
  assert.deepEqual(await fetchMalAnimeDetails(1), {
    status: 'ok',
    details: { watched: 3, total: 12, meanScore: 8.5, coverUrl: 'l.jpg' },
  })
  assert.deepEqual(requests, [
    {
      url: 'https://api.myanimelist.net/v2/anime/1?fields=num_episodes,my_list_status,mean,main_picture',
      auth: 'Bearer token',
    },
  ])

  for (const status of failures) {
    respond = () => new Response('nope', { status })
    assert.deepEqual(await fetchMalAnimeDetails(nextMalId++), {
      status: 'unavailable',
    })
  }
})

test('anime summary: ok, and any failure is null', async () => {
  respond = () =>
    Response.json({
      media_type: 'tv',
      status: 'finished_airing',
      start_date: '2024-01-01',
      num_episodes: 0,
      main_picture: { medium: 'm.jpg' },
    })
  requests.length = 0
  assert.deepEqual(await fetchMalAnimeSummary(2), {
    mediaType: 'tv',
    status: 'finished_airing',
    startDate: '2024-01-01',
    numEpisodes: null,
    coverUrl: 'm.jpg',
  })
  assert.deepEqual(requests, [
    {
      url: 'https://api.myanimelist.net/v2/anime/2?fields=media_type,status,start_date,num_episodes,main_picture',
      auth: 'Bearer token',
    },
  ])

  for (const status of failures) {
    respond = () => new Response('nope', { status })
    assert.equal(await fetchMalAnimeSummary(nextMalId++), null)
  }
})

test('related anime: ok, 403/429 rate limited, 5xx unavailable', async () => {
  respond = () =>
    Response.json({
      related_anime: [
        {
          node: { id: 5, title: 'Sequel', main_picture: { large: 'l.jpg' } },
          relation_type: 'sequel',
          relation_type_formatted: 'Sequel',
        },
        { node: { id: 6, title: 'Other' } },
      ],
    })
  requests.length = 0
  assert.deepEqual(await fetchRelatedAnime(3), {
    status: 'ok',
    related: [
      {
        malId: 5,
        title: 'Sequel',
        relationType: 'sequel',
        relationTypeFormatted: 'Sequel',
        coverUrl: 'l.jpg',
      },
      {
        malId: 6,
        title: 'Other',
        relationType: 'other',
        relationTypeFormatted: 'Related',
        coverUrl: null,
      },
    ],
  })
  assert.deepEqual(requests, [
    {
      url: 'https://api.myanimelist.net/v2/anime/3?fields=related_anime',
      auth: 'Bearer token',
    },
  ])

  const results = []
  for (const status of failures) {
    respond = () => new Response('nope', { status })
    results.push(await fetchRelatedAnime(4))
  }
  assert.deepEqual(results, [
    { status: 'rate_limited', httpStatus: 403 },
    { status: 'rate_limited', httpStatus: 429 },
    { status: 'unavailable' },
  ])
})

test('user list: pages, 403/429 rate limited, 5xx unavailable, no partials', async () => {
  respond = (url) =>
    url.includes('page=2')
      ? Response.json({ data: [{ node: { id: 2, title: 'B' } }] })
      : Response.json({
          data: [{ node: { id: 1, title: 'A' } }],
          paging: { next: 'https://api.myanimelist.net/v2/next?page=2' },
        })
  requests.length = 0
  assert.deepEqual(await fetchUserAnimeList('completed'), {
    status: 'ok',
    entries: [
      { malId: 1, title: 'A' },
      { malId: 2, title: 'B' },
    ],
  })
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      'https://api.myanimelist.net/v2/users/@me/animelist?limit=1000&nsfw=true&status=completed',
      'https://api.myanimelist.net/v2/next?page=2',
    ]
  )

  const results = []
  for (const status of failures) {
    respond = (url) =>
      url.includes('page=2')
        ? new Response('nope', { status })
        : Response.json({
            data: [{ node: { id: 1, title: 'A' } }],
            paging: { next: 'https://api.myanimelist.net/v2/next?page=2' },
          })
    results.push(await fetchUserAnimeList())
  }
  assert.deepEqual(results, [
    { status: 'rate_limited', httpStatus: 403 },
    { status: 'rate_limited', httpStatus: 429 },
    { status: 'unavailable' },
  ])
})

test('plan to watch: keeps partial pages, else unavailable', async () => {
  const firstPage = () =>
    Response.json({
      data: [{ node: { id: 7, title: 'PTW', status: 'currently_airing' } }],
      paging: { next: 'https://api.myanimelist.net/v2/next?page=2' },
    })

  for (const status of failures) {
    requests.length = 0
    respond = (url) =>
      url.includes('page=2') ? new Response('nope', { status }) : firstPage()
    const partial = await fetchPlanToWatchAnime()
    assert.equal(partial.status, 'ok')
    assert.equal(partial.status === 'ok' && partial.entries.length, 1)
    assert.equal(requests[0].auth, 'Bearer token')
    assert.match(
      requests[0].url,
      /^https:\/\/api\.myanimelist\.net\/v2\/users\/@me\/animelist\?status=plan_to_watch&limit=1000&nsfw=true&fields=/
    )

    respond = () => new Response('nope', { status })
    assert.deepEqual(await fetchPlanToWatchAnime(), { status: 'unavailable' })
  }
})
