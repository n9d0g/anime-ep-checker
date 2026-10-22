import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addScheduleBreak,
  describeBreak,
  getBreakAfterEpisode,
} from './schedule-break'
import type { Show, ShowSchedule } from '@shared/types'

const SCHEDULE: ShowSchedule = {
  mode: 'finite',
  startAt: '2026-09-01T15:00:00.000Z',
  startEpisode: 1,
  episodeCount: 12,
  premiereBatchSize: 1,
}

test('a break goes after the last aired episode', () => {
  assert.equal(getBreakAfterEpisode(SCHEDULE, '8'), 8)
})

test('before any episode a break goes before the start episode', () => {
  assert.equal(getBreakAfterEpisode(SCHEDULE, null), 0)
  assert.equal(getBreakAfterEpisode({ ...SCHEDULE, startEpisode: 13 }, ''), 12)
})

test('breaks are added in episode order and merged per episode', () => {
  const first = addScheduleBreak(undefined, 8, 1)
  assert.deepEqual(first, [{ afterEpisode: 8, weeks: 1 }])
  const second = addScheduleBreak(first, 4, 2)
  assert.deepEqual(second, [
    { afterEpisode: 4, weeks: 2 },
    { afterEpisode: 8, weeks: 1 },
  ])
  assert.deepEqual(addScheduleBreak(second, 8, 1), [
    { afterEpisode: 4, weeks: 2 },
    { afterEpisode: 8, weeks: 2 },
  ])
  assert.deepEqual(first, [{ afterEpisode: 8, weeks: 1 }])
})

test('break lengths must be whole weeks', () => {
  assert.throws(() => addScheduleBreak([], 8, 0))
  assert.throws(() => addScheduleBreak([], 8, 1.5))
  assert.throws(() => addScheduleBreak([], 8, 13))
})

test('a break reads as its length and episode', () => {
  assert.equal(
    describeBreak({ afterEpisode: 8, weeks: 1 }),
    '1-week break after episode 8'
  )
})

test('breaks round-trip through the edit form', async () => {
  const { showToForm } = await import('./show-form')
  const { normalizeShow } = await import('./normalize-show')
  const show: Show = {
    id: 'bleach',
    title: 'Bleach',
    provider: 'crunchyroll',
    crunchyrollUrl: 'https://www.crunchyroll.com/series/GRVN8MNQY/bleach',
    seriesId: 'GRVN8MNQY',
    schedule: { ...SCHEDULE, breaks: [{ afterEpisode: 8, weeks: 2 }] },
  }
  assert.deepEqual(normalizeShow(showToForm(show)), show)

  const withoutBreaks: Show = { ...show, schedule: SCHEDULE }
  const values = showToForm(withoutBreaks)
  assert.equal('breaks' in values.schedule, false)
  assert.deepEqual(normalizeShow(values), withoutBreaks)
})
