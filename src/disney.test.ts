import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import {
  getLatestAvailableEpisodeForTitle,
  resetDisneyAuthForRun,
} from './disney.ts'

const SHOW_A = '11111111-1111-1111-1111-111111111111'
const SHOW_B = '22222222-2222-2222-2222-222222222222'

const realFetch = globalThis.fetch
/** Refresh tokens sent to the token endpoint, in order. */
let exchanges: string[]
let tokenResponses: Array<{
  access_token: string
  refresh_token?: string
  expires_in?: number
}>

beforeEach(() => {
  process.env.NODE_ENV = 'test'
  process.env.DISNEY_REFRESH_TOKEN = 'refresh-1'
  resetDisneyAuthForRun()
  exchanges = []
  tokenResponses = []
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.endsWith('/token')) {
      const body = new URLSearchParams(String(init?.body))
      exchanges.push(body.get('refresh_token')!)
      const next = tokenResponses.shift() ?? {
        access_token: 'access',
        expires_in: 3600,
      }
      return Response.json(next)
    }
    if (url.includes('/explore/')) {
      return Response.json({ data: { page: { containers: [] } } })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
})

test('exchanges the refresh token once for several shows in a run', async () => {
  await getLatestAvailableEpisodeForTitle(SHOW_A)
  await getLatestAvailableEpisodeForTitle(SHOW_B)

  assert.deepEqual(exchanges, ['refresh-1'])
})

test('uses the rotated refresh token for a later exchange in the run', async () => {
  tokenResponses = [
    { access_token: 'access-1', refresh_token: 'refresh-2', expires_in: 0 },
  ]

  await getLatestAvailableEpisodeForTitle(SHOW_A)
  await getLatestAvailableEpisodeForTitle(SHOW_B)

  assert.deepEqual(exchanges, ['refresh-1', 'refresh-2'])
})
