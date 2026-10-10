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

test('applyMalUpdatesToShows records English-only title changes', () => {
  const current = [
    show({
      id: 'kusuriya',
      title: 'Kusuriya no Hitorigoto',
      malId: 527,
    }),
  ]
  const updates = [
    {
      id: 'kusuriya',
      title: 'Kusuriya no Hitorigoto',
      malId: 527,
      titleEnglish: 'The Apothecary Diaries',
    },
  ]

  const result = applyMalUpdatesToShows(current, updates)

  assert.equal(result.shows[0]?.titleEnglish, 'The Apothecary Diaries')
  assert.deepEqual(result.updatedEnglish, ['kusuriya'])
  assert.equal(result.updatedTitles.length, 0)
  assert.equal(result.resolvedIds.length, 0)
})

test('applyMalUpdatesToShows corrects a guessed finite episode count', () => {
  const finite = show({ id: 'kusuriya', title: 'Kusuriya', malId: 61987 })
  finite.schedule = { ...finite.schedule, mode: 'finite', episodeCount: 24 }

  const result = applyMalUpdatesToShows(
    [finite],
    [{ id: 'kusuriya', title: 'Kusuriya', malId: 61987, episodeCount: 12 }]
  )

  assert.equal(result.shows[0]?.schedule.episodeCount, 12)
  assert.deepEqual(result.updatedEpisodeCounts, ['kusuriya'])
})

test('applyMalUpdatesToShows makes ongoing shows finite once MAL has a count', () => {
  const result = applyMalUpdatesToShows(
    [show({ id: 'frieren', title: 'Frieren', malId: 2 })],
    [{ id: 'frieren', title: 'Frieren', malId: 2, episodeCount: 10 }]
  )

  assert.equal(result.shows[0]?.schedule.mode, 'finite')
  assert.equal(result.shows[0]?.schedule.episodeCount, 10)
  assert.deepEqual(result.updatedEpisodeCounts, ['frieren'])
})

test("applyMalUpdatesToShows ends the schedule at MAL's last episode", () => {
  const split = show({ id: 'split-cour', title: 'Split Cour', malId: 3 })
  split.schedule = { ...split.schedule, startEpisode: 13 }

  const result = applyMalUpdatesToShows(
    [split],
    [{ id: 'split-cour', title: 'Split Cour', malId: 3, episodeCount: 24 }]
  )

  assert.equal(result.shows[0]?.schedule.mode, 'finite')
  assert.equal(result.shows[0]?.schedule.episodeCount, 12)
})

test('applyMalUpdatesToShows leaves ongoing shows alone without a MAL count', () => {
  const current = [show({ id: 'one-piece', title: 'One Piece', malId: 21 })]

  const result = applyMalUpdatesToShows(current, [
    { id: 'one-piece', title: 'One Piece', malId: 21 },
  ])

  assert.equal(result.shows[0]?.schedule.mode, 'ongoing')
  assert.equal(result.updatedEpisodeCounts.length, 0)
})

test('applyMalUpdatesToShows keeps the guessed count when MAL has none', () => {
  const finite = show({ id: 'ao-no-hako', title: 'Ao no Hako', malId: 1 })
  finite.schedule = { ...finite.schedule, mode: 'finite', episodeCount: 12 }

  const result = applyMalUpdatesToShows(
    [finite],
    [{ id: 'ao-no-hako', title: 'Ao no Hako', malId: 1 }]
  )

  assert.equal(result.shows[0]?.schedule.episodeCount, 12)
  assert.equal(result.updatedEpisodeCounts.length, 0)
})

test('applyMalUpdatesToShows syncs release time to MAL plus buffer', () => {
  const current = [
    show({ id: 'kusuriya', title: 'Kusuriya', malId: 61987 }),
    show({ id: 'no-slot', title: 'No Slot', malId: 4 }),
  ]
  current[0]!.schedule.startAt = '2026-10-02T15:00:00.000Z'
  current[1]!.schedule.startAt = '2026-10-02T15:00:00.000Z'

  const result = applyMalUpdatesToShows(current, [
    {
      id: 'kusuriya',
      title: 'Kusuriya',
      malId: 61987,
      broadcast: { dayOfWeek: 'saturday', startTime: '00:00' },
    },
    { id: 'no-slot', title: 'No Slot', malId: 4 },
  ])

  assert.equal(result.shows[0]?.schedule.startAt, '2026-10-02T16:00:00.000Z')
  assert.equal(result.shows[1]?.schedule.startAt, '2026-10-02T15:00:00.000Z')
  assert.deepEqual(result.updatedStartTimes, ['kusuriya'])
})
