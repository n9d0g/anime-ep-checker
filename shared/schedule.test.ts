import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getExpectedDropAt, getNextDrop } from './schedule.ts'
import type { AiringSchedule, ShowSchedule } from './types.ts'

const SCHEDULE: ShowSchedule = {
  mode: 'finite',
  startAt: '2026-09-01T15:00:00.000Z',
  startEpisode: 1,
  episodeCount: 12,
  premiereBatchSize: 2,
}

test('the next drop before any episode is the premiere', () => {
  assert.deepEqual(getNextDrop(SCHEDULE, null), {
    episode: 1,
    expectedAt: new Date('2026-09-01T15:00:00.000Z'),
  })
  assert.equal(getNextDrop(SCHEDULE, undefined)?.episode, 1)
})

test('the next drop follows the last recorded episode, stored or parsed', () => {
  const expected = {
    episode: 4,
    expectedAt: new Date('2026-09-15T15:00:00.000Z'),
  }
  assert.deepEqual(getNextDrop(SCHEDULE, '3'), expected)
  assert.deepEqual(getNextDrop(SCHEDULE, 3), expected)
})

test('no next drop after the last scheduled episode', () => {
  assert.equal(getNextDrop(SCHEDULE, '12'), null)
})

test('a next drop without a time when the start time is invalid', () => {
  assert.deepEqual(getNextDrop({ ...SCHEDULE, startAt: '' }, '3'), {
    episode: 4,
    expectedAt: null,
  })
})

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function at(iso: string, weeks = 0): Date {
  return new Date(Date.parse(iso) + weeks * WEEK_MS)
}

const WEEKLY: ShowSchedule = {
  mode: 'finite',
  startAt: '2026-09-01T15:00:00.000Z',
  startEpisode: 1,
  episodeCount: 12,
  premiereBatchSize: 1,
}
const START = WEEKLY.startAt

/** AniList broadcast times: weekly from `firstIso`, skipping `gapAfter`. */
function anilist(
  firstIso: string,
  episodes: number,
  gap: { afterEpisode: number; weeks: number } | null = null
): AiringSchedule {
  const times: Record<string, string> = {}
  for (let episode = 1; episode <= episodes; episode++) {
    const shift = gap && episode > gap.afterEpisode ? gap.weeks : 0
    times[String(episode)] = at(firstIso, episode - 1 + shift).toISOString()
  }
  return { fetchedAt: '2026-09-01T00:00:00.000Z', episodes: times }
}

test('a break mid-season shifts later drops of a finite show only', () => {
  const schedule = { ...WEEKLY, breaks: [{ afterEpisode: 8, weeks: 2 }] }
  assert.deepEqual(getExpectedDropAt(schedule, 1), at(START))
  assert.deepEqual(getExpectedDropAt(schedule, 8), at(START, 7))
  assert.deepEqual(getExpectedDropAt(schedule, 9), at(START, 10))
  assert.deepEqual(getExpectedDropAt(schedule, 12), at(START, 13))
  assert.deepEqual(getNextDrop(schedule, '8'), {
    episode: 9,
    expectedAt: at(START, 10),
  })
})

test('a break mid-season shifts later drops of an ongoing show only', () => {
  const schedule: ShowSchedule = {
    ...WEEKLY,
    mode: 'ongoing',
    episodeCount: null,
    breaks: [{ afterEpisode: 20, weeks: 1 }],
  }
  assert.deepEqual(getExpectedDropAt(schedule, 20), at(START, 19))
  assert.deepEqual(getExpectedDropAt(schedule, 21), at(START, 21))
  assert.deepEqual(getExpectedDropAt(schedule, 40), at(START, 40))
})

test('two breaks add up for episodes after both', () => {
  const schedule = {
    ...WEEKLY,
    breaks: [
      { afterEpisode: 6, weeks: 2 },
      { afterEpisode: 3, weeks: 1 },
    ],
  }
  assert.deepEqual(getExpectedDropAt(schedule, 3), at(START, 2))
  assert.deepEqual(getExpectedDropAt(schedule, 4), at(START, 4))
  assert.deepEqual(getExpectedDropAt(schedule, 6), at(START, 6))
  assert.deepEqual(getExpectedDropAt(schedule, 7), at(START, 9))
})

test('AniList times with a gap shift later drops by the provider offset', () => {
  // Japan airs an hour before the configured provider drop; a 2-week break
  // after episode 8.
  const airing = anilist('2026-09-01T14:00:00.000Z', 12, {
    afterEpisode: 8,
    weeks: 2,
  })
  assert.deepEqual(getExpectedDropAt(WEEKLY, 1, airing), at(START))
  assert.deepEqual(getExpectedDropAt(WEEKLY, 8, airing), at(START, 7))
  assert.deepEqual(getExpectedDropAt(WEEKLY, 9, airing), at(START, 10))
  assert.deepEqual(getNextDrop(WEEKLY, '8', airing), {
    episode: 9,
    expectedAt: at(START, 10),
  })
})

test('a regular AniList schedule matches the weekly formula', () => {
  const airing = anilist('2026-09-01T14:00:00.000Z', 12)
  for (let episode = 1; episode <= 12; episode++) {
    assert.deepEqual(
      getExpectedDropAt(WEEKLY, episode, airing),
      getExpectedDropAt(WEEKLY, episode)
    )
  }
})

test('an episode AniList has no time for continues weekly from the last one it has', () => {
  // AniList lists episodes 1-8 with a 1-week gap after 4, so episode 8 drops
  // at week 8; episodes 9 and 10 (TBA) keep that gap instead of jumping back.
  const airing = anilist('2026-09-01T14:00:00.000Z', 8, {
    afterEpisode: 4,
    weeks: 1,
  })
  assert.deepEqual(getExpectedDropAt(WEEKLY, 8, airing), at(START, 8))
  assert.deepEqual(getExpectedDropAt(WEEKLY, 10, airing), at(START, 10))
})

test('without an AniList time for the anchor episode, the weekly formula is used', () => {
  const airing = anilist('2026-09-01T14:00:00.000Z', 8, {
    afterEpisode: 4,
    weeks: 1,
  })

  const noAnchor: AiringSchedule = {
    fetchedAt: airing.fetchedAt,
    episodes: { ...airing.episodes },
  }
  delete noAnchor.episodes['1']
  assert.deepEqual(getExpectedDropAt(WEEKLY, 6, noAnchor), at(START, 5))
})

test('manual breaks shift AniList times instead of replacing them', () => {
  // AniList already has a 3-week gap after episode 4; a manual 1-week break
  // after episode 8 adds to it for later episodes only.
  const airing = anilist('2026-09-01T14:00:00.000Z', 12, {
    afterEpisode: 4,
    weeks: 3,
  })
  const schedule = { ...WEEKLY, breaks: [{ afterEpisode: 8, weeks: 1 }] }
  assert.deepEqual(getExpectedDropAt(schedule, 6, airing), at(START, 8))
  assert.deepEqual(getExpectedDropAt(schedule, 8, airing), at(START, 10))
  assert.deepEqual(getExpectedDropAt(schedule, 9, airing), at(START, 12))
})

test('premiere batch episodes drop together; AniList anchors on the batch end', () => {
  const batch: ShowSchedule = { ...WEEKLY, premiereBatchSize: 3 }
  // The provider drops 1-3 when Japan airs episode 3; Japan then breaks a
  // week after episode 5.
  const airing = anilist('2026-08-18T14:00:00.000Z', 12, {
    afterEpisode: 5,
    weeks: 1,
  })
  assert.deepEqual(getExpectedDropAt(batch, 1, airing), at(START))
  assert.deepEqual(getExpectedDropAt(batch, 3, airing), at(START))
  assert.deepEqual(getExpectedDropAt(batch, 4, airing), at(START, 1))
  assert.deepEqual(getExpectedDropAt(batch, 5, airing), at(START, 2))
  assert.deepEqual(getExpectedDropAt(batch, 6, airing), at(START, 4))

  const withBreak = { ...batch, breaks: [{ afterEpisode: 4, weeks: 2 }] }
  assert.deepEqual(getExpectedDropAt(withBreak, 3), at(START))
  assert.deepEqual(getExpectedDropAt(withBreak, 4), at(START, 1))
  assert.deepEqual(getExpectedDropAt(withBreak, 5), at(START, 4))
})

test('the provider offset keeps only the configured time of day, not whole weeks', () => {
  // Bleach: the configured start is four weeks (and an hour) after Japan's
  // premiere, but Disney+ drops each episode an hour after broadcast.
  // AniList: weekly Saturdays from 2026-07-25 14:00 UTC, then a break, with
  // episode 9 on Monday 2026-10-19 15:00 UTC.
  const bleach: ShowSchedule = {
    mode: 'finite',
    startAt: '2026-08-22T15:00:00.000Z',
    startEpisode: 1,
    episodeCount: 10,
    premiereBatchSize: 1,
  }
  const airing = {
    fetchedAt: '2026-10-22T00:00:00.000Z',
    episodes: {
      '1': '2026-07-25T14:00:00.000Z',
      '8': '2026-09-12T14:00:00.000Z',
      '9': '2026-10-19T15:00:00.000Z',
      '10': '2026-10-26T15:00:00.000Z',
    },
  }

  assert.deepEqual(
    getExpectedDropAt(bleach, 9, airing),
    new Date('2026-10-19T16:00:00.000Z')
  )
  assert.deepEqual(getNextDrop(bleach, '9', airing), {
    episode: 10,
    expectedAt: new Date('2026-10-26T16:00:00.000Z'),
  })
})

test('a provider releasing shortly before broadcast keeps a small negative offset', () => {
  const airing = anilist('2026-09-01T17:00:00.000Z', 12, {
    afterEpisode: 4,
    weeks: 1,
  })
  // Configured 15:00, broadcast 17:00: the provider is 2 hours early.
  assert.deepEqual(
    getExpectedDropAt(WEEKLY, 5, airing),
    new Date(Date.parse(airing.episodes['5']) - 2 * 3600_000)
  )
})
