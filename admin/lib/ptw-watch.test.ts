import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  hasKnownStartAt,
  suggestStartAt,
  uniqueShowId,
  unknownWatchFieldLabels,
  watchFormDefaults,
} from './ptw-watch'
import type { PlanToWatchSnapshotEntry } from './types'

function entry(
  overrides: Partial<PlanToWatchSnapshotEntry> &
    Pick<PlanToWatchSnapshotEntry, 'malId' | 'title'>
): PlanToWatchSnapshotEntry {
  return {
    status: 'not_yet_aired',
    startDate: null,
    broadcast: null,
    coverUrl: null,
    numEpisodes: null,
    ...overrides,
  }
}

test('suggestStartAt uses a full MAL date plus broadcast time', () => {
  const suggested = suggestStartAt(
    entry({
      malId: 61323,
      title: 'Ao no Hako Season 2',
      startDate: '2026-10-04',
      broadcast: { dayOfWeek: 'sunday', startTime: '16:30' },
    })
  )

  assert.equal(suggested, '2026-10-04T16:30')
  assert.equal(
    hasKnownStartAt(
      entry({
        malId: 61323,
        title: 'Ao no Hako Season 2',
        startDate: '2026-10-04',
        broadcast: { dayOfWeek: 'sunday', startTime: '16:30' },
      })
    ),
    true
  )
})

test('suggestStartAt treats incomplete dates or missing times as unknown', () => {
  assert.equal(
    suggestStartAt(
      entry({
        malId: 61990,
        title: 'Cyberpunk: Edgerunners 2',
        startDate: '2026-10-20',
        numEpisodes: 10,
      })
    ),
    ''
  )
  assert.equal(
    suggestStartAt(
      entry({
        malId: 59068,
        title: 'Dungeon Meshi Season 2',
        startDate: '2027-10',
      })
    ),
    ''
  )
  assert.equal(
    suggestStartAt(
      entry({
        malId: 62589,
        title: 'Blue Lock: Neo Egoist League',
      })
    ),
    ''
  )
})

test('unknownWatchFieldLabels always asks for provider and other missing fields', () => {
  assert.deepEqual(
    unknownWatchFieldLabels(
      entry({
        malId: 61323,
        title: 'Ao no Hako Season 2',
        startDate: '2026-10-04',
        broadcast: { dayOfWeek: 'sunday', startTime: '16:30' },
        numEpisodes: null,
      })
    ),
    ['streaming service and URL', 'number of episodes']
  )

  assert.deepEqual(
    unknownWatchFieldLabels(
      entry({
        malId: 57,
        title: 'Beck',
        startDate: '2004-10-07',
        broadcast: { dayOfWeek: 'thursday', startTime: '01:30' },
        numEpisodes: 26,
      })
    ),
    ['streaming service and URL']
  )

  assert.deepEqual(
    unknownWatchFieldLabels(
      entry({
        malId: 62589,
        title: 'Blue Lock: Neo Egoist League',
      })
    ),
    ['streaming service and URL', 'start date and time', 'number of episodes']
  )
})

test('watchFormDefaults prefills known episode count and start time', () => {
  const form = watchFormDefaults(
    entry({
      malId: 57,
      title: 'Beck',
      startDate: '2004-10-07',
      broadcast: { dayOfWeek: 'thursday', startTime: '1:30' },
      numEpisodes: 26,
    })
  )

  assert.equal(form.title, 'Beck')
  assert.equal(form.malId, '57')
  assert.equal(form.schedule.startAt, '2004-10-07T01:30')
  assert.equal(form.schedule.episodeCount, '26')
  assert.equal(form.schedule.startEpisode, '1')
})

test('uniqueShowId avoids collisions with existing watching ids', () => {
  assert.equal(uniqueShowId('Beck', 57, []), 'beck')
  assert.equal(uniqueShowId('Beck', 57, ['beck']), 'beck-57')
  assert.equal(uniqueShowId('Beck', 57, ['beck', 'beck-57']), 'beck-57-2')
})
