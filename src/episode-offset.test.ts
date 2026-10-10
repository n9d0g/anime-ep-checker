import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveEpisodeOffset, toRelativeSnapshot } from './episode-offset.js'
import type { EpisodeSnapshot, Show } from './types.js'

function show(overrides: Partial<Show> = {}): Show {
  return {
    id: 'test-show',
    title: 'Test Show',
    provider: 'crunchyroll',
    schedule: {
      mode: 'ongoing',
      startAt: '2026-10-02T15:00:00.000Z',
      startEpisode: 1,
      episodeCount: null,
      premiereBatchSize: 1,
    },
    ...overrides,
  }
}

function snapshot(overrides: Partial<EpisodeSnapshot> = {}): EpisodeSnapshot {
  return {
    provider: 'crunchyroll',
    seriesId: 'SERIES',
    seriesTitle: 'Test Show',
    seasonId: 'SEASON',
    seasonTitle: 'Season 3',
    episode: {
      id: 'ep',
      episode: 49,
      title: 'Episode',
      availableAt: '2026-10-02T16:00:00.000Z',
    },
    watchUrl: 'https://example.com',
    ...overrides,
  }
}

test('resolveEpisodeOffset returns null when only the previous season is out', () => {
  const offset = resolveEpisodeOffset(
    show(),
    snapshot({
      episode: {
        id: 'ep48',
        episode: 48,
        availableAt: '2026-01-01T00:00:00.000Z',
      },
      seasonEpisodes: [
        {
          episode: 25,
          available: true,
          availableAt: '2026-01-01T00:00:00.000Z',
        },
        {
          episode: 48,
          available: true,
          availableAt: '2026-06-01T00:00:00.000Z',
        },
      ],
    })
  )

  assert.equal(offset, null)
})

test('resolveEpisodeOffset returns 48 when season 3 episode 49 is available after start', () => {
  const offset = resolveEpisodeOffset(
    show(),
    snapshot({
      seasonEpisodes: [
        {
          episode: 49,
          available: true,
          availableAt: '2026-10-02T16:00:00.000Z',
        },
        { episode: 50, available: false, availableAt: null },
      ],
    })
  )

  assert.equal(offset, 48)
})

test('resolveEpisodeOffset returns 0 for Netflix season 2 episode 1', () => {
  const offset = resolveEpisodeOffset(
    show({ provider: 'netflix' }),
    snapshot({
      provider: 'netflix',
      episode: {
        id: '1',
        episode: 1,
        availableAt: '2026-10-04T08:30:00.000Z',
      },
      seasonEpisodes: [
        {
          episode: 1,
          available: true,
          availableAt: '2026-10-04T08:30:00.000Z',
        },
      ],
    })
  )

  assert.equal(offset, 0)
})

test('resolveEpisodeOffset uses the first post-start candidate when new episodes append', () => {
  const offset = resolveEpisodeOffset(
    show(),
    snapshot({
      seasonEpisodes: [
        {
          episode: 49,
          available: true,
          availableAt: '2026-10-02T16:00:00.000Z',
        },
        {
          episode: 50,
          available: true,
          availableAt: '2026-10-09T16:00:00.000Z',
        },
      ],
    })
  )

  assert.equal(offset, 48)
})

test('toRelativeSnapshot subtracts the offset from episode numbers', () => {
  const relative = toRelativeSnapshot(
    snapshot({
      seasonEpisodes: [
        {
          episode: 49,
          available: true,
          availableAt: '2026-10-02T16:00:00.000Z',
        },
      ],
    }),
    48
  )

  assert.equal(relative.episode.episode, 1)
  assert.equal(relative.seasonEpisodes?.[0]?.episode, 1)
})
