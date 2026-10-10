import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alignStartAtToBroadcast } from './broadcast'

test('alignStartAtToBroadcast sets the drop to MAL time plus one hour', () => {
  // Fri 2026-10-02 00:00 JST, MAL says Fridays 00:00 → drop at 01:00 JST.
  assert.equal(
    alignStartAtToBroadcast('2026-10-01T15:00:00.000Z', {
      dayOfWeek: 'friday',
      startTime: '00:00',
    }),
    '2026-10-01T16:00:00.000Z'
  )
})

test('alignStartAtToBroadcast is stable once aligned', () => {
  const broadcast = { dayOfWeek: 'friday', startTime: '00:00' }
  const aligned = alignStartAtToBroadcast('2026-10-01T15:00:00.000Z', broadcast)

  assert.equal(alignStartAtToBroadcast(aligned!, broadcast), aligned)
})

test('alignStartAtToBroadcast handles the buffer crossing midnight', () => {
  // Sat 23:30 JST + 1h → Sun 00:30 JST.
  assert.equal(
    alignStartAtToBroadcast('2026-10-03T14:30:00.000Z', {
      dayOfWeek: 'saturday',
      startTime: '23:30',
    }),
    '2026-10-03T15:30:00.000Z'
  )
})

test('alignStartAtToBroadcast keeps the week of a delayed schedule', () => {
  // Guessed Mon 2026-10-12 20:00 JST (a week after a delay); MAL says Sundays
  // 16:30 → Sun 2026-10-11 17:30 JST, not the original premiere week.
  assert.equal(
    alignStartAtToBroadcast('2026-10-12T11:00:00.000Z', {
      dayOfWeek: 'sunday',
      startTime: '16:30',
    }),
    '2026-10-11T08:30:00.000Z'
  )
})

test('alignStartAtToBroadcast ignores missing or unusable slots', () => {
  const startAt = '2026-10-01T15:00:00.000Z'
  assert.equal(alignStartAtToBroadcast(startAt, null), null)
  assert.equal(
    alignStartAtToBroadcast(startAt, { dayOfWeek: 'friday', startTime: null }),
    null
  )
  assert.equal(
    alignStartAtToBroadcast(startAt, { dayOfWeek: 'other', startTime: '1:00' }),
    null
  )
})
