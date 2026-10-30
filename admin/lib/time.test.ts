import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatCalendarDate,
  formatDropTime,
  formatEasternDateTime,
  formatRelative,
  formatShortDate,
  formatUpdatedAgo,
} from './time'

// Fri Oct 30, 2026, 12:00 PM EDT.
const NOW = new Date('2026-10-30T16:00:00Z')
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs)
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

test('formatRelative uses whole minutes, hours or days, rounded down', () => {
  assert.equal(formatRelative(at(20 * 1000), NOW), 'in 1m')
  assert.equal(formatRelative(at(35 * MINUTE), NOW), 'in 35m')
  assert.equal(formatRelative(at(-59 * MINUTE), NOW), '59m ago')
  assert.equal(formatRelative(at(60 * MINUTE), NOW), 'in 1h')
  assert.equal(formatRelative(at(-(23 * HOUR + 59 * MINUTE)), NOW), '23h ago')
  assert.equal(formatRelative(at(2 * DAY + 5 * HOUR), NOW), 'in 2d')
})

test('formatDropTime is relative with the Eastern day and time within a week', () => {
  // Sun Nov 1, 2026, 10:00 AM EST (DST has ended).
  assert.equal(
    formatDropTime(new Date('2026-11-01T15:00:00Z'), NOW),
    'in 1d · Sun 10:00 AM ET'
  )
  assert.equal(
    formatDropTime(at(-35 * MINUTE), NOW),
    '35m ago · Fri 11:25 AM ET'
  )
})

test('formatDropTime is just the day a week or more away', () => {
  assert.equal(formatDropTime(at(7 * DAY), NOW), 'Nov 6')
  assert.equal(
    formatDropTime(new Date('2027-01-08T15:00:00Z'), NOW),
    'Jan 8, 2027'
  )
  assert.equal(formatDropTime('not a date', NOW), null)
})

test('formatShortDate adds the year only outside the current year', () => {
  assert.equal(formatShortDate('2026-09-28T21:46:38Z', NOW), 'Sep 28')
  assert.equal(formatShortDate('2025-12-31T12:00:00Z', NOW), 'Dec 31, 2025')
  // Just after midnight UTC on Jan 1 is still Dec 31 in Eastern Time.
  assert.equal(formatShortDate('2026-01-01T02:00:00Z', NOW), 'Dec 31, 2025')
  assert.equal(formatShortDate(null, NOW), null)
})

test('formatCalendarDate reads date-only values as calendar days', () => {
  assert.equal(
    formatCalendarDate(new Date(Date.UTC(2026, 11, 11)), NOW),
    'Dec 11'
  )
  assert.equal(
    formatCalendarDate(new Date(Date.UTC(2027, 0, 8)), NOW),
    'Jan 8, 2027'
  )
})

test('formatEasternDateTime is an absolute Eastern day and time', () => {
  assert.equal(
    formatEasternDateTime('2026-10-02T15:00:00Z', NOW),
    'Oct 2, 11:00 AM ET'
  )
  assert.equal(formatEasternDateTime(undefined, NOW), null)
})

test('formatUpdatedAgo reads "updated just now" within the minute', () => {
  assert.equal(formatUpdatedAgo(at(-30 * 1000), NOW), 'updated just now')
  assert.equal(formatUpdatedAgo(at(-3 * HOUR), NOW), 'updated 3h ago')
  assert.equal(formatUpdatedAgo(null, NOW), null)
})
