import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isAnnouncementCheckDue } from './announced-break.ts'
import type { Show, ShowState } from './types.ts'

/** Episode 3 drops 2026-09-15T15:00Z. */
const SHOW: Show = {
  id: 'frieren',
  title: 'Frieren',
  provider: 'crunchyroll',
  schedule: {
    mode: 'ongoing',
    startAt: '2026-09-01T15:00:00.000Z',
    startEpisode: 1,
    episodeCount: null,
    premiereBatchSize: 1,
  },
}

function stateCheckedAt(checkedAt: string | null): ShowState {
  return {
    lastEpisodeId: 'ep-2',
    lastEpisodeNumber: '2',
    lastEpisodeTitle: '',
    lastNotifiedAt: '',
    seasonId: '',
    seasonTitle: '',
    announcementCheckedAt: checkedAt,
  }
}

const due = (now: string, checkedAt: string | null) =>
  isAnnouncementCheckDue(SHOW, stateCheckedAt(checkedAt), new Date(now))

test('announcement checks run daily in the 3 days before the next drop', () => {
  assert.equal(due('2026-09-12T14:00:00.000Z', null), false)
  assert.equal(due('2026-09-12T16:00:00.000Z', null), true)
  assert.equal(
    due('2026-09-14T15:00:00.000Z', '2026-09-13T16:00:00.000Z'),
    true
  )
  assert.equal(
    due('2026-09-14T15:00:00.000Z', '2026-09-13T17:00:00.000Z'),
    false
  )
})

test('past still waiting, announcement checks run every 30 minutes, then daily after a day', () => {
  // Checked the day before: due as soon as still waiting fires.
  assert.equal(
    due('2026-09-15T15:16:00.000Z', '2026-09-14T15:00:00.000Z'),
    true
  )
  assert.equal(
    due('2026-09-15T15:40:00.000Z', '2026-09-15T15:16:00.000Z'),
    false
  )
  assert.equal(
    due('2026-09-15T15:46:00.000Z', '2026-09-15T15:16:00.000Z'),
    true
  )
  assert.equal(
    due('2026-09-16T16:00:00.000Z', '2026-09-16T15:00:00.000Z'),
    false
  )
  assert.equal(
    due('2026-09-17T15:00:00.000Z', '2026-09-16T15:00:00.000Z'),
    true
  )
})

test('shows without state are never due', () => {
  assert.equal(
    isAnnouncementCheckDue(SHOW, null, new Date('2026-09-15T16:00:00.000Z')),
    false
  )
})
