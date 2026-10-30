import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AnnouncedBreak, ShowSchedule } from '@shared/types'
import { getScheduleChip } from './schedule-chip'
import type { ShowStateSummary } from './types'

const MINUTE = 60 * 1000
const WEEK = 7 * 24 * 60 * MINUTE

// Episode 1 drops Thu Oct 1, 2026, 15:00 UTC; one a week after that.
const SCHEDULE: ShowSchedule = {
  mode: 'finite',
  startAt: '2026-10-01T15:00:00.000Z',
  startEpisode: 1,
  episodeCount: 12,
  premiereBatchSize: 1,
}
const EP5_AT = Date.parse(SCHEDULE.startAt) + 4 * WEEK

function state(overrides: Partial<ShowStateSummary> = {}): ShowStateSummary {
  return {
    lastEpisodeNumber: '4',
    lastEpisodeTitle: '',
    lastNotifiedAt: '',
    ...overrides,
  }
}

const announced: AnnouncedBreak = {
  episode: 5,
  newDate: null,
  sourceUrl: null,
  status: 'pending',
  announcedAt: '2026-10-28T00:00:00Z',
}

const at = (ms: number) => new Date(ms)

test('no chip on an ordinary week', () => {
  assert.equal(
    getScheduleChip(SCHEDULE, state(), at(EP5_AT - (2 * WEEK) / 7)),
    null
  )
})

test('dropping now inside the drop window, before the waiting grace', () => {
  assert.equal(
    getScheduleChip(SCHEDULE, state(), at(EP5_AT - 5 * MINUTE))?.kind,
    'dropping_now'
  )
  assert.equal(
    getScheduleChip(SCHEDULE, state(), at(EP5_AT + 10 * MINUTE))?.kind,
    'dropping_now'
  )
  assert.equal(
    getScheduleChip(SCHEDULE, state(), at(EP5_AT - 6 * MINUTE)),
    null
  )
})

test('still waiting once past the 15-minute grace', () => {
  assert.deepEqual(
    getScheduleChip(SCHEDULE, state(), at(EP5_AT + 16 * MINUTE)),
    {
      kind: 'still_waiting',
      label: 'Still waiting',
    }
  )
})

test('provider lag when AniList shows the late episode already broadcast', () => {
  const live = state({
    airingSchedule: {
      fetchedAt: '2026-10-28T00:00:00Z',
      episodes: { '5': new Date(EP5_AT - 60 * MINUTE).toISOString() },
    },
  })
  assert.deepEqual(
    getScheduleChip(SCHEDULE, live, at(EP5_AT + 2 * 60 * MINUTE)),
    {
      kind: 'provider_lag',
      label: 'Provider lag',
    }
  )
})

test('a break before the next drop shows its length', () => {
  const schedule = { ...SCHEDULE, breaks: [{ afterEpisode: 4, weeks: 2 }] }
  assert.deepEqual(getScheduleChip(schedule, state(), at(EP5_AT)), {
    kind: 'break',
    label: 'Break +2w',
  })
})

test('a break further ahead shows nothing yet', () => {
  const schedule = { ...SCHEDULE, breaks: [{ afterEpisode: 6, weeks: 1 }] }
  assert.equal(getScheduleChip(schedule, state(), at(EP5_AT - WEEK / 2)), null)
})

test('an announced break wins over every other state', () => {
  const live = state({ announcedBreak: announced })
  assert.equal(
    getScheduleChip(SCHEDULE, live, at(EP5_AT + 30 * MINUTE))?.kind,
    'announced_break'
  )
  assert.equal(
    getScheduleChip(
      SCHEDULE,
      state({ announcedBreak: { ...announced, status: 'dismissed' } }),
      at(EP5_AT + 30 * MINUTE)
    )?.kind,
    'still_waiting'
  )
})

test('no time-based chip before the checker has seen the show', () => {
  assert.equal(
    getScheduleChip(SCHEDULE, undefined, at(EP5_AT + 30 * MINUTE)),
    null
  )
})

test('no chip once the schedule has no more episodes', () => {
  assert.equal(
    getScheduleChip(
      SCHEDULE,
      state({ lastEpisodeNumber: '12' }),
      at(EP5_AT + 30 * MINUTE)
    ),
    null
  )
})
