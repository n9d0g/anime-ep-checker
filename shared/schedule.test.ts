import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getNextDrop } from './schedule.ts'
import type { ShowSchedule } from './types.ts'

const SCHEDULE: ShowSchedule = {
  mode: 'finite',
  startAt: '2026-09-01T15:00:00.000Z',
  startEpisode: 1,
  episodeCount: 12,
  premiereBatchSize: 2,
}

test('the next drop before any episode is the premiere', () => {
  assert.deepEqual(getNextDrop(SCHEDULE, null), {
    episode: 1,
    expectedAt: new Date('2026-09-01T15:00:00.000Z'),
  })
  assert.equal(getNextDrop(SCHEDULE, undefined)?.episode, 1)
})

test('the next drop follows the last recorded episode, stored or parsed', () => {
  const expected = {
    episode: 4,
    expectedAt: new Date('2026-09-15T15:00:00.000Z'),
  }
  assert.deepEqual(getNextDrop(SCHEDULE, '3'), expected)
  assert.deepEqual(getNextDrop(SCHEDULE, 3), expected)
})

test('no next drop after the last scheduled episode', () => {
  assert.equal(getNextDrop(SCHEDULE, '12'), null)
})

test('a next drop without a time when the start time is invalid', () => {
  assert.deepEqual(getNextDrop({ ...SCHEDULE, startAt: '' }, '3'), {
    episode: 4,
    expectedAt: null,
  })
})
