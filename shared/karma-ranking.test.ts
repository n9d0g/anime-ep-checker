import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getDueKarmaRankingWeek,
  getKarmaRankingWeek,
  getPendingKarmaRankingWeek,
} from './karma-ranking.ts'

test('a karma ranking week runs Monday to Sunday, Eastern midnight to midnight', () => {
  const week = getKarmaRankingWeek('2026-11-22')
  assert.equal(week.start.toISOString(), '2026-11-16T05:00:00.000Z')
  assert.equal(week.end.toISOString(), '2026-11-23T05:00:00.000Z')
})

test('a karma ranking week follows DST and month boundaries', () => {
  // DST ends Sunday 2026-11-01: Monday Oct 26 is EDT, Monday Nov 2 is EST.
  const week = getKarmaRankingWeek('2026-11-01')
  assert.equal(week.start.toISOString(), '2026-10-26T04:00:00.000Z')
  assert.equal(week.end.toISOString(), '2026-11-02T05:00:00.000Z')
})

test('the ranking is due from Sunday 20:00 Eastern through Monday', () => {
  assert.equal(getDueKarmaRankingWeek(new Date('2026-11-23T00:59:00Z')), null)
  assert.equal(
    getDueKarmaRankingWeek(new Date('2026-11-23T01:00:00Z'))?.weekEnding,
    '2026-11-22'
  )
  assert.equal(
    getDueKarmaRankingWeek(new Date('2026-11-24T04:59:00Z'))?.weekEnding,
    '2026-11-22'
  )
  assert.equal(getDueKarmaRankingWeek(new Date('2026-11-24T05:00:00Z')), null)
  assert.equal(getDueKarmaRankingWeek(new Date('2026-11-27T01:00:00Z')), null)
})

test('the ranking is pending until its week is recorded as sent', () => {
  const now = new Date('2026-11-23T02:00:00Z')
  assert.equal(
    getPendingKarmaRankingWeek({ shows: {} }, now)?.weekEnding,
    '2026-11-22'
  )
  const lastWeek = {
    shows: {},
    meta: {
      karmaRanking: { weekEnding: '2026-11-15', sentAt: '2026-11-16T01:00Z' },
    },
  }
  assert.equal(
    getPendingKarmaRankingWeek(lastWeek, now)?.weekEnding,
    '2026-11-22'
  )
  const sent = {
    shows: {},
    meta: {
      karmaRanking: { weekEnding: '2026-11-22', sentAt: '2026-11-23T01:00Z' },
    },
  }
  assert.equal(getPendingKarmaRankingWeek(sent, now), null)
})
