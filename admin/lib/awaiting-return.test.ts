import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { OnHoldSnapshotEntry, StateFile } from '@shared/types'
import {
  formatReturn,
  getReturningShows,
  setAwaitingReturn,
} from './awaiting-return'

const NOW = new Date('2026-10-31T12:00:00.000Z')
const URL = 'https://one-piece.com/news/index.html?category=anime'

const entry = (id: string): OnHoldSnapshotEntry => ({
  show: {
    id,
    title: id,
    provider: 'crunchyroll',
    schedule: {
      mode: 'ongoing',
      startAt: '2026-07-12T16:00:00.000Z',
      startEpisode: 1169,
      episodeCount: null,
      premiereBatchSize: 1,
    },
  },
  heldAt: '2026-09-28T21:46:38.715Z',
})

function makeState(): StateFile {
  return {
    shows: {},
    meta: {
      returnCheckedAt: '2026-10-31T00:00:00.000Z',
      onHold: {
        updatedAt: '2026-09-28T21:46:38.715Z',
        entries: [entry('one-piece'), entry('paused')],
      },
    },
  }
}

test('marking a show awaiting return saves its URL and clears the daily check', () => {
  const state = setAwaitingReturn(
    makeState(),
    'one-piece',
    { awaiting: true, officialNewsUrl: ` ${URL} ` },
    NOW
  )
  const [onePiece, paused] = state.meta!.onHold!.entries
  assert.deepEqual(onePiece!.awaitingReturn, {
    officialNewsUrl: URL,
    markedAt: NOW.toISOString(),
  })
  assert.equal(paused!.awaitingReturn, undefined)
  assert.equal(state.meta!.returnCheckedAt, null)

  // Changing the URL later keeps when it was first marked.
  const later = new Date('2026-11-05T00:00:00.000Z')
  const edited = setAwaitingReturn(
    state,
    'one-piece',
    { awaiting: true, officialNewsUrl: '' },
    later
  )
  assert.deepEqual(edited.meta!.onHold!.entries[0]!.awaitingReturn, {
    officialNewsUrl: null,
    markedAt: NOW.toISOString(),
  })
})

test('unmarking keeps the daily check, and bad input is refused', () => {
  const state = setAwaitingReturn(
    makeState(),
    'one-piece',
    { awaiting: false },
    NOW
  )
  assert.equal(state.meta!.onHold!.entries[0]!.awaitingReturn, null)
  assert.equal(state.meta!.returnCheckedAt, '2026-10-31T00:00:00.000Z')

  assert.throws(() =>
    setAwaitingReturn(makeState(), 'missing', { awaiting: true }, NOW)
  )
  assert.throws(() =>
    setAwaitingReturn(
      makeState(),
      'one-piece',
      { awaiting: true, officialNewsUrl: 'one-piece.com' },
      NOW
    )
  )
})

test('only shows still awaiting return with an announcement are returning', () => {
  const announcement = {
    returnsOn: null,
    returnsIn: 'July 2027',
    episode: null,
    sourceUrl: URL,
    announcedAt: NOW.toISOString(),
  }
  const state = setAwaitingReturn(
    makeState(),
    'one-piece',
    { awaiting: true, officialNewsUrl: URL },
    NOW
  )
  state.meta!.returnAnnouncements = {
    'one-piece': announcement,
    paused: announcement,
  }
  assert.deepEqual(
    getReturningShows(state).map(({ entry }) => entry.show.id),
    ['one-piece']
  )
})

test('a return reads as a date, a rough time or TBA', () => {
  const base = { episode: null, sourceUrl: null, announcedAt: '' }
  assert.equal(
    formatReturn({ ...base, returnsOn: '2027-07-04', returnsIn: null }),
    'Returns Jul 4, 2027 (JST)'
  )
  assert.equal(
    formatReturn({ ...base, returnsOn: null, returnsIn: 'Summer 2027' }),
    'Returns Summer 2027'
  )
  assert.equal(
    formatReturn({ ...base, returnsOn: null, returnsIn: null }),
    'Return announced, date TBA'
  )
})
