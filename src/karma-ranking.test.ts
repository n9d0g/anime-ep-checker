import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  parseKarmaRanking,
  syncKarmaRanking,
  type KarmaRankingEntry,
  type KarmaRankingFetchResult,
} from './karma-ranking.ts'
import type { StateFile } from '../shared/types.ts'

function apiItem(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'x',
    episodeNumber: 8,
    utcTime: '2026-11-20T15:02:19.000Z',
    karma: 1720,
    commentCount: 544,
    commentLink: 'https://www.reddit.com/r/anime/comments/1y15omu/thread/',
    postId: '1y15omu',
    anilistId: 195516,
    malId: 61987,
    name: 'The Apothecary Diaries Season 3',
    romaji: 'Kusuriya no Hitorigoto 3rd Season',
    ...overrides,
  }
}

test('parses AnimeKarmaList episodes into the Top 10 by karma', () => {
  const items = Array.from({ length: 15 }, (_, i) =>
    apiItem({ karma: 100 + i, name: `Show ${i}` })
  )
  const entries = parseKarmaRanking(items)
  assert.equal(entries.length, 10)
  assert.deepEqual(
    entries.map((entry) => entry.karma),
    [114, 113, 112, 111, 110, 109, 108, 107, 106, 105]
  )
  assert.deepEqual(entries[0], {
    title: 'Show 14',
    episodeNumber: 8,
    karma: 114,
    commentCount: 544,
    threadUrl: 'https://www.reddit.com/r/anime/comments/1y15omu/thread/',
  })
})

test('falls back to the romaji title and skips malformed episodes', () => {
  const entries = parseKarmaRanking([
    apiItem({ name: '', karma: 5 }),
    apiItem({ karma: 'lots' }),
    apiItem({ commentLink: 'https://example.com/not-reddit' }),
    null,
  ])
  assert.deepEqual(
    entries.map((entry) => entry.title),
    ['Kusuriya no Hitorigoto 3rd Season']
  )
  assert.throws(() => parseKarmaRanking({ message: 'nope' }))
})

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const ENTRY: KarmaRankingEntry = {
  title: 'Show',
  episodeNumber: 1,
  karma: 10,
  commentCount: 2,
  threadUrl: 'https://www.reddit.com/r/anime/comments/abc/show/',
}

async function sync(
  state: StateFile,
  now: string,
  result: KarmaRankingFetchResult
) {
  const posted: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    posted.push(String(input))
    return new Response(null, { status: 204 })
  }) as typeof fetch
  const weeks: string[] = []
  const outcome = await syncKarmaRanking({
    state,
    discord: { webhookUrl: 'https://discord.test/webhook' },
    now: new Date(now),
    fetchRanking: async (week) => {
      weeks.push(`${week.start.toISOString()}/${week.end.toISOString()}`)
      return result
    },
  })
  return { ...outcome, posted, weeks }
}

test('sends the week ending Sunday once and records it', async () => {
  const state: StateFile = { shows: {} }
  const now = '2026-11-23T01:00:00.000Z'
  const first = await sync(state, now, { ok: true, entries: [ENTRY] })
  assert.deepEqual(first.weeks, [
    '2026-11-16T05:00:00.000Z/2026-11-23T05:00:00.000Z',
  ])
  assert.deepEqual(first.posted, ['https://discord.test/webhook'])
  assert.equal(first.changed, true)
  assert.deepEqual(state.meta?.karmaRanking, {
    weekEnding: '2026-11-22',
    sentAt: now,
  })

  const second = await sync(state, '2026-11-23T01:30:00.000Z', {
    ok: true,
    entries: [ENTRY],
  })
  assert.deepEqual(second.weeks, [])
  assert.deepEqual(second.posted, [])
  assert.equal(second.changed, false)
})

test('leaves the week unsent when the fetch fails or is empty', async () => {
  const state: StateFile = { shows: {} }
  const now = '2026-11-23T01:00:00.000Z'
  const failed = await sync(state, now, {
    ok: false,
    status: 503,
    message: 'AnimeKarmaList returned 503',
  })
  const empty = await sync(state, now, { ok: true, entries: [] })
  for (const outcome of [failed, empty]) {
    assert.equal(outcome.changed, false)
    assert.deepEqual(outcome.posted, [])
  }
  assert.equal(state.meta?.karmaRanking, undefined)
})

test('does nothing outside Sunday evening and Monday', async () => {
  const outcome = await sync({ shows: {} }, '2026-11-22T20:00:00.000Z', {
    ok: true,
    entries: [ENTRY],
  })
  assert.deepEqual(outcome.weeks, [])
  assert.equal(outcome.changed, false)
})
