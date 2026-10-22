import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveShowDashboardStatus } from './dashboard.ts'
import type { Show, ShowState } from '../shared/types.ts'

// Episode 3 drops 2026-09-15 15:00 UTC; "now" is a day later, well outside
// its drop window and past the still-waiting grace.
const now = new Date('2026-09-16T15:00:00.000Z')

function makeShow(provider: Show['provider']): Show {
  return {
    id: 'show',
    title: 'Show',
    provider,
    schedule: {
      mode: 'ongoing',
      startAt: '2026-09-01T15:00:00.000Z',
      startEpisode: 1,
      episodeCount: null,
      premiereBatchSize: 1,
    },
  }
}

function stateAt(lastEpisode: number, snapshotEpisode?: number): ShowState {
  return {
    lastEpisodeId: `ep-${lastEpisode}`,
    lastEpisodeNumber: String(lastEpisode),
    lastEpisodeTitle: '',
    lastNotifiedAt: '2026-09-08T15:00:00.000Z',
    seasonId: 'season-1',
    seasonTitle: 'Season 1',
    ...(snapshotEpisode !== undefined
      ? { lastSnapshotEpisode: snapshotEpisode }
      : {}),
  }
}

test('shows "out now" from the saved snapshot outside the drop window', () => {
  const status = resolveShowDashboardStatus(
    makeShow('crunchyroll'),
    stateAt(2, 3),
    now
  )
  assert.equal(status, 'out')
})

test('falls back to the schedule when no snapshot has been saved', () => {
  const status = resolveShowDashboardStatus(
    makeShow('crunchyroll'),
    stateAt(2),
    now
  )
  assert.equal(status, 'waiting')
})

test('shows "out now" for a Disney+ show from its snapshot', () => {
  const status = resolveShowDashboardStatus(
    makeShow('disney'),
    stateAt(2, 3),
    now
  )
  assert.equal(status, 'out')
})
