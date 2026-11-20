import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getDesiredCalendarEvents, planCalendarSync } from './calendar-plan.ts'
import type { ShowSchedule } from '../shared/types.ts'

const NOW = new Date('2026-10-22T12:00:00.000Z')
const EP4 = '2026-10-22T15:00:00.000Z'
const EP5 = '2026-10-29T15:00:00.000Z'
const EP6 = '2026-11-05T15:00:00.000Z'

const finite: ShowSchedule = {
  mode: 'finite',
  startAt: '2026-10-01T15:00:00.000Z',
  startEpisode: 1,
  episodeCount: 6,
  premiereBatchSize: 1,
}

test('desired events are every remaining drop of a finite schedule', () => {
  assert.deepEqual(getDesiredCalendarEvents(finite, 3, NOW), [
    { episode: 4, startAt: EP4 },
    { episode: 5, startAt: EP5 },
    { episode: 6, startAt: EP6 },
  ])
})

test('desired events skip drops that are not after now', () => {
  // Before the baseline the next drop is episode 1, long past.
  assert.deepEqual(getDesiredCalendarEvents(finite, null, new Date(EP5)), [
    { episode: 6, startAt: EP6 },
  ])
})

test('an ongoing schedule only wants the next drop', () => {
  const ongoing: ShowSchedule = {
    ...finite,
    mode: 'ongoing',
    episodeCount: null,
  }
  assert.deepEqual(getDesiredCalendarEvents(ongoing, 3, NOW), [
    { episode: 4, startAt: EP4 },
  ])
})

test('a finished schedule wants no events', () => {
  assert.deepEqual(getDesiredCalendarEvents(finite, 6, NOW), [])
})

test('desired events follow a break and the AniList airing schedule', () => {
  const later = '2026-11-12T15:00:00.000Z'
  assert.deepEqual(
    getDesiredCalendarEvents(
      { ...finite, breaks: [{ afterEpisode: 5, weeks: 1 }] },
      3,
      NOW
    ),
    [
      { episode: 4, startAt: EP4 },
      { episode: 5, startAt: EP5 },
      { episode: 6, startAt: later },
    ]
  )

  const airing = {
    fetchedAt: '2026-10-22T00:00:00.000Z',
    episodes: {
      '1': '2026-10-01T14:00:00.000Z',
      '4': '2026-10-29T14:00:00.000Z',
      '5': '2026-11-05T14:00:00.000Z',
      '6': '2026-11-12T14:00:00.000Z',
    },
  }
  assert.deepEqual(getDesiredCalendarEvents(finite, 3, NOW, airing), [
    { episode: 4, startAt: EP5 },
    { episode: 5, startAt: EP6 },
    { episode: 6, startAt: later },
  ])
})

test('missing events are created in episode order', () => {
  assert.deepEqual(
    planCalendarSync(
      [
        { episode: 4, startAt: EP4 },
        { episode: 5, startAt: EP5 },
      ],
      []
    ),
    {
      deletes: [],
      writes: [
        { action: 'create', episode: 4, startAt: EP4 },
        { action: 'create', episode: 5, startAt: EP5 },
      ],
      unchanged: [],
    }
  )
})

test('events at the right time are unchanged, moved ones are updated', () => {
  assert.deepEqual(
    planCalendarSync(
      [
        { episode: 4, startAt: EP4 },
        { episode: 5, startAt: EP5 },
        { episode: 6, startAt: EP6 },
      ],
      [
        { episode: '4', eventId: 'a', startAt: EP4 },
        { episode: '5', eventId: 'b', startAt: '2026-10-29T16:00:00.000Z' },
        { episode: '6', eventId: 'c', startAt: null },
      ]
    ),
    {
      deletes: [],
      writes: [
        { action: 'update', episode: 5, startAt: EP5, eventId: 'b' },
        { action: 'update', episode: 6, startAt: EP6, eventId: 'c' },
      ],
      unchanged: [{ episode: 4, startAt: EP4, eventId: 'a' }],
    }
  )
})

test('the first existing event for an episode wins', () => {
  const plan = planCalendarSync(
    [{ episode: 4, startAt: EP4 }],
    [
      { episode: '4', eventId: 'stored', startAt: '2026-10-22T14:00:00.000Z' },
      { episode: '4', eventId: 'listed', startAt: EP4 },
    ]
  )
  assert.deepEqual(plan.writes, [
    { action: 'update', episode: 4, startAt: EP4, eventId: 'stored' },
  ])
  // A duplicate for a desired episode is left alone, not deleted.
  assert.deepEqual(plan.deletes, [])
})

test('every event for an episode that is not desired is deleted once', () => {
  const plan = planCalendarSync(
    [{ episode: 4, startAt: EP4 }],
    [
      { episode: '2', eventId: 'stored-2', startAt: null },
      { episode: '4', eventId: 'stored-4', startAt: EP4 },
      { episode: '9', eventId: 'shared-9', startAt: null },
      { episode: '2', eventId: 'listed-2', startAt: null },
      { episode: '9', eventId: 'shared-9', startAt: null },
    ]
  )
  assert.deepEqual(plan.deletes, ['stored-2', 'shared-9', 'listed-2'])
  assert.deepEqual(plan.writes, [])
})

test('nothing desired deletes everything', () => {
  assert.deepEqual(
    planCalendarSync([], [{ episode: '6', eventId: 'x', startAt: EP6 }]),
    { deletes: ['x'], writes: [], unchanged: [] }
  )
})

test('a listed event at the same instant in another format is unchanged', () => {
  const plan = planCalendarSync(
    [{ episode: 4, startAt: '2026-10-24T15:00:00.000Z' }],
    [
      {
        eventId: 'listed-4',
        episode: '4',
        startAt: '2026-10-24T11:00:00-04:00',
      },
    ]
  )

  assert.deepEqual(plan.writes, [])
  assert.deepEqual(plan.unchanged, [
    { episode: 4, startAt: '2026-10-24T15:00:00.000Z', eventId: 'listed-4' },
  ])
})

test('a listed event at a different instant is updated', () => {
  const plan = planCalendarSync(
    [{ episode: 4, startAt: '2026-10-24T15:00:00.000Z' }],
    [
      {
        eventId: 'listed-4',
        episode: '4',
        startAt: '2026-10-24T15:00:00-04:00',
      },
    ]
  )

  assert.deepEqual(plan.writes, [
    {
      action: 'update',
      episode: 4,
      startAt: '2026-10-24T15:00:00.000Z',
      eventId: 'listed-4',
    },
  ])
})

test('an event whose title lacks the current Episode code is rewritten', () => {
  const label = (episode: number) => `Frieren s1e${episode}`
  assert.deepEqual(
    planCalendarSync(
      [
        { episode: 4, startAt: EP4 },
        { episode: 5, startAt: EP5 },
        { episode: 6, startAt: EP6 },
      ],
      [
        {
          episode: '4',
          eventId: 'e4',
          startAt: EP4,
          summary: 'Frieren — Episode 4',
        },
        {
          episode: '5',
          eventId: 'e5',
          startAt: EP5,
          summary: 'Frieren s1e5: Title',
        },
        // A title the calendar didn't list is left alone.
        { episode: '6', eventId: 'e6', startAt: EP6 },
      ],
      label
    ),
    {
      deletes: [],
      writes: [{ action: 'update', episode: 4, startAt: EP4, eventId: 'e4' }],
      unchanged: [
        { episode: 5, startAt: EP5, eventId: 'e5' },
        { episode: 6, startAt: EP6, eventId: 'e6' },
      ],
    }
  )
})

test('an Episode code that only prefixes another is not current', () => {
  assert.deepEqual(
    planCalendarSync(
      [{ episode: 1, startAt: EP4 }],
      [{ episode: '1', eventId: 'e1', startAt: EP4, summary: 'Frieren s1e12' }],
      () => 'Frieren s1e1'
    ).writes,
    [{ action: 'update', episode: 1, startAt: EP4, eventId: 'e1' }]
  )
})
