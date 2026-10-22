import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { MalRelatedAnime } from './mal.ts'
import { diffRelatedAnime, syncRelatedAnimeAlerts } from './related-anime.ts'
import { needsRelatedAnimeCheck } from './schedule.ts'
import type { StateFile } from './types.ts'

function related(malId: number, relationType = 'sequel'): MalRelatedAnime {
  return {
    malId,
    title: `Anime ${malId}`,
    relationType,
    relationTypeFormatted: relationType,
    coverUrl: null,
  }
}

function stateWithCheckedAt(checkedAt?: string): StateFile {
  return { shows: {}, meta: { relatedAnimeCheckedAt: checkedAt } }
}

test('baselines a title with no previous record without alerting', () => {
  const result = diffRelatedAnime({
    previousSeen: undefined,
    related: [related(2), related(1)],
    onListMalIds: new Set(),
  })
  assert.deepEqual(result.seen, [1, 2])
  assert.deepEqual(result.newRelated, [])
})

test('alerts only unseen, off-list, relevant relations', () => {
  const result = diffRelatedAnime({
    previousSeen: [1],
    related: [
      related(1),
      related(2),
      related(3),
      related(4, 'character'),
      related(5, 'other'),
      related(6, 'spin_off'),
    ],
    onListMalIds: new Set([3]),
  })
  assert.deepEqual(
    result.newRelated.map((item) => item.malId),
    [2, 6]
  )
  assert.deepEqual(result.seen, [1, 2, 3, 4, 5, 6])
})

test('related anime check is due on Sunday (Eastern) only', () => {
  // 2026-10-11 is a Sunday; 14:00Z is 10:00 EDT.
  assert.equal(
    needsRelatedAnimeCheck(
      stateWithCheckedAt(),
      new Date('2026-10-11T14:00:00Z')
    ),
    true
  )
  // Saturday 23:00 EDT is already Sunday in UTC.
  assert.equal(
    needsRelatedAnimeCheck(
      stateWithCheckedAt(),
      new Date('2026-10-11T03:00:00Z')
    ),
    false
  )
  assert.equal(
    needsRelatedAnimeCheck(
      stateWithCheckedAt(),
      new Date('2026-10-12T14:00:00Z')
    ),
    false
  )
})

test('related anime check runs once per Sunday', () => {
  const now = new Date('2026-10-11T20:00:00Z')
  assert.equal(
    needsRelatedAnimeCheck(stateWithCheckedAt('2026-10-11T14:00:00Z'), now),
    false
  )
  assert.equal(
    needsRelatedAnimeCheck(stateWithCheckedAt('2026-10-04T14:00:00Z'), now),
    true
  )
})

test('stops at the first MAL rate limit and alerts Discord once', async (t) => {
  process.env.MAL_CLIENT_ID = 'id'
  process.env.MAL_CLIENT_SECRET = 'secret'
  process.env.MAL_REFRESH_TOKEN = 'refresh'
  t.after(() => {
    delete process.env.MAL_CLIENT_ID
    delete process.env.MAL_CLIENT_SECRET
    delete process.env.MAL_REFRESH_TOKEN
  })

  const relatedCalls: string[] = []
  const webhookBodies: string[] = []
  t.mock.method(
    globalThis,
    'fetch',
    async (input: string, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('oauth2/token')) {
        return Response.json({ access_token: 'token' })
      }
      if (url.includes('/users/@me/animelist')) {
        return Response.json({
          data: [1, 2, 3].map((id) => ({ node: { id, title: `Anime ${id}` } })),
        })
      }
      if (url.includes('fields=related_anime')) {
        relatedCalls.push(url)
        return relatedCalls.length === 1
          ? Response.json({ related_anime: [] })
          : new Response('Too Many Requests', { status: 429 })
      }
      if (url.startsWith('https://discord.test/')) {
        webhookBodies.push(String(init?.body))
        return new Response(null, { status: 204 })
      }
      throw new Error(`Unexpected fetch ${url}`)
    }
  )

  const state: StateFile = {
    shows: {},
    meta: { relatedAnimeSeen: { '2': [10], '3': [20] } },
  }
  const now = new Date('2026-10-11T14:00:00Z')
  const result = await syncRelatedAnimeAlerts({
    state,
    discord: { webhookUrl: 'https://discord.test/hook' },
    now,
  })

  assert.equal(relatedCalls.length, 2, 'no requests after the 429')
  assert.equal(webhookBodies.length, 1)
  assert.match(webhookBodies[0], /HTTP 429/)
  assert.match(webhookBodies[0], /1 of 3/)
  assert.equal(result.changed, true)
  assert.equal(state.meta?.relatedAnimeCheckedAt, now.toISOString())
  assert.deepEqual(state.meta?.relatedAnimeSeen, {
    '1': [],
    '2': [10],
    '3': [20],
  })
})
