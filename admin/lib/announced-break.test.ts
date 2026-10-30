import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getAnnouncedBreakSuggestion } from './announced-break'
import type { AnnouncedBreak, ShowSchedule } from '@shared/types'

/** Episode 9 drops 2026-10-29T15:00Z: Friday 00:00 JST, Oct 30. */
const SCHEDULE: ShowSchedule = {
  mode: 'finite',
  startAt: '2026-09-03T15:00:00.000Z',
  startEpisode: 1,
  episodeCount: 12,
  premiereBatchSize: 1,
}

function announced(newDate: string | null): AnnouncedBreak {
  return {
    episode: 9,
    newDate,
    sourceUrl: null,
    status: 'pending',
    announcedAt: '2026-10-27T00:00:00.000Z',
  }
}

const suggest = (newDate: string | null) =>
  getAnnouncedBreakSuggestion(SCHEDULE, announced(newDate))

test('an announced break a week or more later suggests a break, rounded to the nearest week', () => {
  assert.deepEqual(suggest('2026-11-06'), { afterEpisode: 8, weeks: 1 })
  assert.deepEqual(suggest('2026-11-09'), { afterEpisode: 8, weeks: 1 })
  assert.deepEqual(suggest('2026-11-11'), { afterEpisode: 8, weeks: 2 })
  assert.deepEqual(suggest('2026-11-13'), { afterEpisode: 8, weeks: 2 })
})

test('a TBA, a shift under a week or a dismissed break suggests nothing', () => {
  assert.equal(suggest(null), null)
  assert.equal(suggest('2026-11-01'), null)
  assert.equal(suggest('2026-11-05'), null)
  assert.equal(
    getAnnouncedBreakSuggestion(SCHEDULE, {
      ...announced('2026-11-06'),
      status: 'dismissed',
    }),
    null
  )
})
