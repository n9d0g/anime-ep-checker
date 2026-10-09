import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { WatchedEntry } from './types'
import {
  filterWatched,
  getWatchedStats,
  groupWatched,
  sortWatched,
} from './watched'
import { cleanSynopsis, formatAirDates, formatBroadcast, formatMalDate } from './anime-format'

function entry(overrides: Partial<WatchedEntry>): WatchedEntry {
  return {
    malId: 1,
    title: 'Show',
    coverUrl: null,
    mediaType: 'tv',
    numEpisodes: 12,
    episodeDurationSec: 1440,
    season: null,
    meanScore: null,
    genres: [],
    studios: [],
    score: null,
    startedAt: null,
    finishedAt: null,
    updatedAt: null,
    timesRewatched: 0,
    ...overrides,
  }
}

const a = entry({ malId: 1, title: 'Alpha', score: 7, finishedAt: '2024-03-02' })
const b = entry({ malId: 2, title: 'Bravo', score: 9, finishedAt: '2025-11-20' })
const c = entry({
  malId: 3,
  title: 'Charlie',
  updatedAt: '2026-01-05T10:00:00+00:00',
  studios: ['Kyoto Animation'],
})

test('sortWatched recent puts newest finish/update first', () => {
  assert.deepEqual(
    sortWatched([a, b, c], 'recent').map((item) => item.malId),
    [3, 2, 1]
  )
})

test('sortWatched score puts unscored last', () => {
  assert.deepEqual(
    sortWatched([c, a, b], 'score').map((item) => item.malId),
    [2, 1, 3]
  )
})

test('groupWatched recent groups by year watched, falling back to last update', () => {
  const d = entry({ malId: 4, title: 'Delta' })
  const groups = groupWatched(sortWatched([a, b, c, d], 'recent'), 'recent')
  assert.deepEqual(
    groups.map((group) => [group.title, group.entries.length]),
    [
      ['2026', 1],
      ['2025', 1],
      ['2024', 1],
      ['No date', 1],
    ]
  )
})

test('filterWatched matches titles and studios', () => {
  assert.deepEqual(
    filterWatched([a, b, c], 'kyoto').map((item) => item.malId),
    [3]
  )
  assert.deepEqual(
    filterWatched([a, b, c], 'brav').map((item) => item.malId),
    [2]
  )
})

test('getWatchedStats averages scored entries and counts rewatches', () => {
  const stats = getWatchedStats([a, b, entry({ timesRewatched: 1 })])
  assert.equal(stats.count, 3)
  assert.equal(stats.meanScore, 8)
  assert.equal(stats.episodes, 48)
  assert.equal(stats.watchSeconds, 48 * 1440)
})

test('formatMalDate handles partial MAL dates', () => {
  assert.equal(formatMalDate('2024'), '2024')
  assert.equal(formatMalDate(null), null)
  assert.match(formatMalDate('2024-03') ?? '', /2024/)
})

test('cleanSynopsis strips the MAL Rewrite credit', () => {
  assert.equal(
    cleanSynopsis('A robot runs a hotel.\n\n[Written by MAL Rewrite]'),
    'A robot runs a hotel.'
  )
  assert.equal(cleanSynopsis('Plain text (Source: Crunchyroll)'), 'Plain text')
  assert.equal(cleanSynopsis(null), null)
})

test('formatAirDates and formatBroadcast', () => {
  assert.equal(formatAirDates('2025', '2025'), '2025')
  assert.equal(formatAirDates(null, null), null)
  assert.equal(
    formatBroadcast({ dayOfWeek: 'wednesday', startTime: '01:34' }),
    'Wednesdays 01:34 JST'
  )
})
