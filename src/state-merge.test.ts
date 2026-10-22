import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeState } from './state-merge.ts'
import type { ShowState, StateFile } from '../shared/types.ts'

const show: ShowState = {
  lastEpisodeId: 'ep-3',
  lastEpisodeNumber: '3',
  lastEpisodeTitle: 'Third',
  lastNotifiedAt: '2026-10-14T15:00:00.000Z',
  seasonId: 'season-1',
  seasonTitle: 'Season 1',
}

const base: StateFile = {
  shows: { frieren: show },
  meta: { planToWatchCheckedAt: '2026-10-21T00:00:00.000Z' },
}

test('keeps the state as-is when neither side changed it', () => {
  const result = mergeState(base, structuredClone(base), structuredClone(base))
  assert.deepEqual(result.merged, base)
  assert.deepEqual(result.conflicts, [])
})

test('keeps both sides when the checker and the admin changed different fields', () => {
  const ours: StateFile = {
    shows: {
      frieren: {
        ...show,
        lastEpisodeId: 'ep-4',
        lastEpisodeNumber: '4',
        lastEpisodeTitle: 'Fourth',
      },
    },
    meta: { planToWatchCheckedAt: '2026-10-22T00:00:00.000Z' },
  }
  const theirs: StateFile = {
    shows: { frieren: { ...show, episodeOffset: 28 } },
    meta: { ...base.meta, malDownSince: null },
  }

  const result = mergeState(base, ours, theirs)

  assert.deepEqual(result.merged, {
    shows: {
      frieren: {
        ...show,
        lastEpisodeId: 'ep-4',
        lastEpisodeNumber: '4',
        lastEpisodeTitle: 'Fourth',
        episodeOffset: 28,
      },
    },
    meta: {
      planToWatchCheckedAt: '2026-10-22T00:00:00.000Z',
      malDownSince: null,
    },
  })
  assert.deepEqual(result.conflicts, [])
})

test('keeps the admin value and reports the field when both sides changed it', () => {
  const ours: StateFile = {
    ...base,
    shows: { frieren: { ...show, lastEpisodeNumber: '4', seasonTitle: 'S1' } },
  }
  const theirs: StateFile = {
    ...base,
    shows: { frieren: { ...show, lastEpisodeNumber: '2' } },
  }

  const result = mergeState(base, ours, theirs)

  assert.deepEqual(result.merged.shows.frieren, {
    ...show,
    lastEpisodeNumber: '2',
    seasonTitle: 'S1',
  })
  assert.deepEqual(result.conflicts, ['shows.frieren.lastEpisodeNumber'])
})

test('drops a show the admin removed even if the checker updated it', () => {
  const ours: StateFile = {
    ...base,
    shows: { frieren: { ...show, lastEpisodeNumber: '4' } },
  }
  const theirs: StateFile = { ...base, shows: {} }

  const result = mergeState(base, ours, theirs)

  assert.deepEqual(result.merged.shows, {})
  assert.deepEqual(result.conflicts, ['shows.frieren'])
})
