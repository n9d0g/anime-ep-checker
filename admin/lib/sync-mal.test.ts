import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyMalUpdatesToShows } from './sync-mal'
import type { Show } from './types'

function show(overrides: Partial<Show> & Pick<Show, 'id' | 'title'>): Show {
  return {
    provider: 'crunchyroll',
    schedule: {
      mode: 'ongoing',
      startAt: '2026-01-01T00:00:00.000Z',
      startEpisode: 1,
      episodeCount: null,
      premiereBatchSize: 1,
    },
    ...overrides,
  }
}

test('applyMalUpdatesToShows does not re-add shows that were removed', () => {
  const current = [show({ id: 'one-piece', title: 'One Piece', malId: 21 })]
  const updates = [
    { id: 'one-piece', title: 'One Piece', malId: 21 },
    { id: 'chainsmoker-cat', title: 'Yani Neko', malId: 63403 },
  ]

  const result = applyMalUpdatesToShows(current, updates)

  assert.deepEqual(
    result.shows.map((entry) => entry.id),
    ['one-piece']
  )
  assert.equal(result.resolvedIds.length, 0)
  assert.equal(result.updatedTitles.length, 0)
})

test('applyMalUpdatesToShows applies title and malId updates to remaining shows', () => {
  const current = [
    show({ id: 'bleach', title: 'Bleach', provider: 'disney' }),
    show({ id: 'one-piece', title: 'One Piece', malId: 21 }),
  ]
  const updates = [
    { id: 'bleach', title: 'Bleach: Sennen Kessen-hen', malId: 60636 },
    { id: 'one-piece', title: 'One Piece', malId: 21 },
  ]

  const result = applyMalUpdatesToShows(current, updates)

  assert.equal(result.shows[0]?.title, 'Bleach: Sennen Kessen-hen')
  assert.equal(result.shows[0]?.malId, 60636)
  assert.deepEqual(result.resolvedIds, ['bleach'])
  assert.deepEqual(result.updatedTitles, ['bleach'])
  assert.equal(result.shows[1]?.title, 'One Piece')
})
