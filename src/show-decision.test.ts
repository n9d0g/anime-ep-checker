import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  decideShow,
  planShowLookup,
  type PlannedDrop,
} from './show-decision.ts'
import type { EpisodeSnapshot } from './types.ts'
import type { Show, ShowState } from '../shared/types.ts'

const SHOW: Show = {
  id: 'frieren',
  title: 'Frieren',
  provider: 'crunchyroll',
  seriesId: 'series-frieren',
  schedule: {
    mode: 'ongoing',
    startAt: '2026-09-01T15:00:00.000Z',
    startEpisode: 1,
    episodeCount: null,
    premiereBatchSize: 1,
  },
}

/** Episode 3 drops 2026-09-15T15:00Z. */
const EP3: PlannedDrop = {
  episode: 3,
  expectedAt: new Date('2026-09-15T15:00:00.000Z'),
}
const NOW = new Date('2026-09-15T16:00:00.000Z')

function state(episode: number, extra: Partial<ShowState> = {}): ShowState {
  return {
    lastEpisodeId: `ep-${episode}`,
    lastEpisodeNumber: String(episode),
    lastEpisodeTitle: '',
    lastNotifiedAt: '2026-09-08T15:00:00.000Z',
    seasonId: 'season-1',
    seasonTitle: 'Season 1',
    episodeOffset: 0,
    ...extra,
  }
}

function snapshot(
  episode: number,
  extra: Partial<EpisodeSnapshot> = {}
): EpisodeSnapshot {
  return {
    provider: 'crunchyroll',
    seriesId: 'series-frieren',
    seriesTitle: 'Frieren',
    seasonId: 'season-1',
    seasonTitle: 'Season 1',
    episode: { id: `ep-${episode}`, episode: String(episode) },
    watchUrl: '',
    ...extra,
  }
}

function lastSeason(episode: number): EpisodeSnapshot {
  return snapshot(episode, {
    episode: {
      id: `ep-${episode}`,
      episode: String(episode),
      availableAt: '2026-06-01T15:00:00.000Z',
    },
  })
}

test('plan: no next drop once the schedule has ended', () => {
  const show = {
    ...SHOW,
    schedule: { ...SHOW.schedule, mode: 'finite' as const, episodeCount: 2 },
  }
  assert.deepEqual(
    planShowLookup({ show, previousState: state(2), now: NOW, force: true }),
    { kind: 'schedule_ended' }
  )
})

test('plan: no expected time when the start time is invalid', () => {
  const show = { ...SHOW, schedule: { ...SHOW.schedule, startAt: 'soon' } }
  assert.deepEqual(
    planShowLookup({ show, previousState: state(2), now: NOW, force: false }),
    { kind: 'no_expected_time', episode: 3 }
  )
})

test('plan: outside the drop window unless forced', () => {
  const now = new Date('2026-09-14T15:00:00.000Z')
  const input = { show: SHOW, previousState: state(2), now }
  assert.deepEqual(planShowLookup({ ...input, force: false }), {
    kind: 'outside_drop_window',
    nextDrop: EP3,
  })
  assert.deepEqual(planShowLookup({ ...input, force: true }), {
    kind: 'look_up',
    nextDrop: EP3,
    mode: null,
  })
})

test('plan: drop window, then late slots', () => {
  const plan = (iso: string) =>
    planShowLookup({
      show: SHOW,
      previousState: state(2),
      now: new Date(iso),
      force: false,
    })
  assert.deepEqual(plan('2026-09-15T14:55:00.000Z'), {
    kind: 'look_up',
    nextDrop: EP3,
    mode: 'drop_window',
  })
  assert.deepEqual(plan('2026-09-15T17:00:00.000Z'), {
    kind: 'look_up',
    nextDrop: EP3,
    mode: 'late_slot',
  })
  assert.equal(plan('2026-09-15T17:10:00.000Z').kind, 'outside_drop_window')
})

test('first sight of last season only is a previous-season baseline', () => {
  const decision = decideShow({
    show: SHOW,
    previousState: null,
    snapshot: lastSeason(12),
    nextDrop: { episode: 1, expectedAt: new Date(SHOW.schedule.startAt) },
    now: NOW,
  })
  assert.deepEqual(decision, {
    kind: 'previous_season_baseline',
    state: {
      lastEpisodeId: 'previous-season',
      lastEpisodeNumber: '0',
      lastEpisodeTitle: '',
      lastNotifiedAt: NOW.toISOString(),
      seasonId: '',
      seasonTitle: '',
      waitingNotifiedForEpisode: null,
    },
  })
})

test('a tracked show still on last season gets no alert', () => {
  const decision = decideShow({
    show: SHOW,
    previousState: state(0, { episodeOffset: undefined }),
    snapshot: lastSeason(12),
    nextDrop: { episode: 1, expectedAt: new Date(SHOW.schedule.startAt) },
    now: NOW,
  })
  assert.deepEqual(decision, { kind: 'previous_season_on_provider' })
})

test('first sight below the next drop is a baseline', () => {
  // checkShows can't reach this today: with no saved state the next drop is
  // the start episode, and a current-season snapshot is renumbered to at least
  // that. Recorded so the branch keeps its behaviour.
  const decision = decideShow({
    show: SHOW,
    previousState: null,
    snapshot: snapshot(1, {
      seasonEpisodes: [{ episode: 1, availableAt: null, available: true }],
    }),
    nextDrop: EP3,
    now: NOW,
  })
  assert.equal(decision.kind, 'baseline')
  assert.equal(decision.kind === 'baseline' && decision.state.episodeOffset, 0)
  assert.equal(
    decision.kind === 'baseline' && decision.state.lastEpisodeNumber,
    '1'
  )
})

test('first sight at or past the next drop is a catch-up alert', () => {
  const decision = decideShow({
    show: SHOW,
    previousState: null,
    snapshot: snapshot(3, {
      seasonEpisodes: [1, 2, 3].map((episode) => ({
        episode,
        availableAt: null,
        available: true,
      })),
    }),
    nextDrop: { episode: 1, expectedAt: new Date(SHOW.schedule.startAt) },
    now: NOW,
  })
  assert.equal(decision.kind, 'episode_alert')
  if (decision.kind !== 'episode_alert') return
  assert.equal(decision.catchUp, true)
  assert.equal(decision.episodeNumber, 3)
  assert.equal(decision.expectedDropAt, EP3.expectedAt.toISOString())
  assert.equal(decision.state.lastEpisodeNumber, '3')
  assert.equal(decision.state.episodeOffset, 0)
})

test('a new episode alerts the next drop and keeps the rest of the state', () => {
  const decision = decideShow({
    show: SHOW,
    previousState: state(2, {
      malMeanScore: 9.1,
      waitingNotifiedForEpisode: 3,
    }),
    snapshot: snapshot(4),
    nextDrop: EP3,
    now: NOW,
  })
  assert.deepEqual(decision, {
    kind: 'episode_alert',
    catchUp: false,
    episodeNumber: 3,
    expectedDropAt: EP3.expectedAt.toISOString(),
    snapshot: {
      ...snapshot(4),
      episode: { id: 'ep-4', episode: 4 },
      seasonEpisodes: undefined,
    },
    snapshotEpisode: 4,
    state: {
      ...state(2, { malMeanScore: 9.1 }),
      lastEpisodeId: 'ep-4',
      lastEpisodeNumber: '3',
      lastNotifiedAt: NOW.toISOString(),
      waitingNotifiedForEpisode: null,
    },
  })
})

test('past the grace period the next drop gets one still-waiting alert', () => {
  const input = { show: SHOW, snapshot: snapshot(2), nextDrop: EP3, now: NOW }
  assert.deepEqual(decideShow({ ...input, previousState: state(2) }), {
    kind: 'still_waiting',
    episodeNumber: 3,
    expectedDropAt: EP3.expectedAt.toISOString(),
    snapshotEpisode: 2,
    state: { ...state(2), waitingNotifiedForEpisode: 3 },
  })
  assert.deepEqual(
    decideShow({
      ...input,
      previousState: state(2, { waitingNotifiedForEpisode: 3 }),
    }),
    { kind: 'not_out_yet', episodeNumber: 3, snapshotEpisode: 2 }
  )
})

test('within the grace period the next drop is just not out yet', () => {
  assert.deepEqual(
    decideShow({
      show: SHOW,
      previousState: state(2),
      snapshot: snapshot(2),
      nextDrop: EP3,
      now: new Date('2026-09-15T15:15:00.000Z'),
    }),
    { kind: 'not_out_yet', episodeNumber: 3, snapshotEpisode: 2 }
  )
})
