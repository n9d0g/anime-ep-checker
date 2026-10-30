// Expected values were recorded from the previous hand-copied gate
// (src/should-run.mjs) before it was deleted. The only intended difference is
// Reddit staleness: the gate now shares the checker's 6h limit (was 2h).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { RedditUserFetchResult } from './reddit.ts'
import { decideGate } from './should-run.ts'
import type { Show, ShowSchedule, StateFile } from '../shared/types.ts'

type FeedStates = NonNullable<NonNullable<StateFile['meta']>['redditUserFeeds']>

const FEEDS: FeedStates = {
  animecorner: {
    seenPostIds: ['t3_old'],
    checkedAt: '2026-10-16T12:00:00.000Z',
    lastPostPublishedAt: '2026-10-16T12:00:00.000Z',
  },
  abysswatcherbel: {
    seenPostIds: [],
    checkedAt: '2026-10-18T13:00:00.000Z',
    lastPostPublishedAt: '2026-10-18T13:00:00.000Z',
  },
}

function makeShow(schedule: Partial<ShowSchedule> = {}): Show {
  return {
    id: 'show',
    title: 'Show',
    provider: 'crunchyroll',
    schedule: {
      mode: 'finite',
      // Thursday 15:00 UTC; episode 4 drops 2026-10-22T15:00Z.
      startAt: '2026-10-01T15:00:00.000Z',
      startEpisode: 1,
      episodeCount: 12,
      premiereBatchSize: 1,
      ...schedule,
    },
  }
}

/** State where nothing but the case under test is due. */
function makeState(
  now: string,
  shows: StateFile['shows'] = {},
  meta: StateFile['meta'] = {}
): StateFile {
  const checked = Object.fromEntries(
    Object.entries(shows).map(([id, showState]) => [
      id,
      { announcementCheckedAt: now, ...showState },
    ])
  )
  return {
    shows: checked,
    meta: {
      planToWatchCheckedAt: new Date(
        new Date(now).getTime() - 60 * 60 * 1000
      ).toISOString(),
      redditUserFeeds: FEEDS,
      ...meta,
    },
  }
}

function lastEpisode(n: number): StateFile['shows'][string] {
  return { lastEpisodeNumber: String(n) } as StateFile['shows'][string]
}

function fakeFeed(posts: { id: string; title: string }[] | null) {
  const calls: string[] = []
  const fetchRedditFeed = async (
    username: string
  ): Promise<RedditUserFetchResult> => {
    calls.push(username)
    if (!posts) {
      return { ok: false, status: 500 }
    }
    return {
      ok: true,
      posts: posts.map((post) => ({
        ...post,
        href: `https://www.reddit.com/comments/${post.id}`,
        published: null,
        subreddit: null,
      })),
    }
  }
  return { calls, fetchRedditFeed }
}

async function decide(
  now: string,
  shows: Show[],
  state: StateFile,
  posts: { id: string; title: string }[] | null = []
) {
  const feed = fakeFeed(posts)
  const decision = await decideGate({
    shows,
    state,
    now: new Date(now),
    fetchRedditFeed: feed.fetchRedditFeed,
  })
  return { ...decision, fetches: feed.calls.length }
}

const DROP_WINDOW_CASES: [time: string, shouldCheck: boolean][] = [
  ['14:54', false], // 6 minutes before the drop
  ['14:55', true], // drop window opens 5 minutes early
  ['15:00', true],
  ['16:30', true], // drop window closes 90 minutes after
  ['16:35', false],
  ['16:55', false],
  ['17:00', true], // first late slot
  ['17:05', false],
  ['17:30', true],
  ['20:00', true],
  ['20:05', false],
]

for (const [time, shouldCheck] of DROP_WINDOW_CASES) {
  test(`gate ${shouldCheck ? 'runs' : 'skips'} at ${time} for a 15:00 next drop`, async () => {
    const now = `2026-10-22T${time}:00.000Z`
    const result = await decide(
      now,
      [makeShow()],
      makeState(now, { show: lastEpisode(3) })
    )
    assert.equal(result.shouldCheck, shouldCheck)
    assert.equal(result.redditCheck, false)
    assert.equal(result.fetches, 0)
  })
}

test('gate reports drop window vs late slot', async () => {
  const dense = await decide(
    '2026-10-22T15:00:00.000Z',
    [makeShow()],
    makeState('2026-10-22T15:00:00.000Z', { show: lastEpisode(3) })
  )
  assert.deepEqual(dense.reasons, ['At least one show is in its drop window.'])

  const late = await decide(
    '2026-10-22T17:00:00.000Z',
    [makeShow()],
    makeState('2026-10-22T17:00:00.000Z', { show: lastEpisode(3) })
  )
  assert.deepEqual(late.reasons, ['At least one show is in its late slot.'])
})

test('gate skips a finished show at the would-be next drop', async () => {
  const now = '2026-12-24T15:00:00.000Z'
  const result = await decide(
    now,
    [makeShow()],
    makeState(now, { show: lastEpisode(12) })
  )
  assert.equal(result.shouldCheck, false)
})

test('gate keeps checking an ongoing show past its episode count', async () => {
  const now = '2026-12-24T15:00:00.000Z'
  const result = await decide(
    now,
    [makeShow({ mode: 'ongoing', episodeCount: null })],
    makeState(now, { show: lastEpisode(12) })
  )
  assert.equal(result.shouldCheck, true)
})

test('gate checks a show with no state at its premiere', async () => {
  const now = '2026-10-01T15:00:00.000Z'
  const result = await decide(now, [makeShow()], makeState(now))
  assert.equal(result.shouldCheck, true)
})

test('gate schedules the episode after a premiere batch one week later', async () => {
  const now = '2026-10-08T15:10:00.000Z'
  const result = await decide(
    now,
    [makeShow({ premiereBatchSize: 3 })],
    makeState(now, { show: lastEpisode(3) })
  )
  assert.equal(result.shouldCheck, true)
})

test('gate follows a break in the schedule and in AniList times', async () => {
  // Episode 4's weekly time is 2026-10-22T15:00Z; a week's break moves it.
  const weekly = '2026-10-22T15:00:00.000Z'
  const shifted = '2026-10-29T15:00:00.000Z'
  const withBreak = makeShow({ breaks: [{ afterEpisode: 3, weeks: 1 }] })
  const state = (now: string, airing?: Record<string, string>) =>
    makeState(now, {
      show: {
        ...lastEpisode(3),
        ...(airing
          ? { airingSchedule: { fetchedAt: now, episodes: airing } }
          : {}),
      },
    })

  assert.equal(
    (await decide(weekly, [withBreak], state(weekly))).shouldCheck,
    false
  )
  assert.equal(
    (await decide(shifted, [withBreak], state(shifted))).shouldCheck,
    true
  )

  const airing = {
    '1': '2026-10-01T14:00:00.000Z',
    '4': '2026-10-29T14:00:00.000Z',
  }
  assert.equal(
    (await decide(weekly, [makeShow()], state(weekly, airing))).shouldCheck,
    false
  )
  assert.equal(
    (await decide(shifted, [makeShow()], state(shifted, airing))).shouldCheck,
    true
  )
})

test('gate runs when the plan-to-watch check is due', async () => {
  const now = '2026-10-22T12:00:00.000Z'
  const result = await decide(now, [], {
    shows: {},
    meta: { redditUserFeeds: FEEDS },
  })
  assert.equal(result.shouldCheck, true)
  assert.equal(result.redditCheck, false)
})

test('gate runs the related anime check once on Sundays', async () => {
  const now = '2026-10-25T16:00:00.000Z'
  const redditUserFeeds = {
    ...FEEDS,
    abysswatcherbel: {
      ...FEEDS.abysswatcherbel,
      lastPostPublishedAt: '2026-10-25T13:00:00.000Z',
    },
  }
  const due = await decide(now, [], makeState(now, {}, { redditUserFeeds }))
  assert.equal(due.shouldCheck, true)

  const done = await decide(
    now,
    [],
    makeState(
      now,
      {},
      { redditUserFeeds, relatedAnimeCheckedAt: '2026-10-25T05:00:00.000Z' }
    )
  )
  assert.equal(done.shouldCheck, false)
})

test('gate runs to clean up a removed show', async () => {
  const now = '2026-10-22T12:00:00.000Z'
  const result = await decide(now, [], makeState(now, { gone: lastEpisode(1) }))
  assert.equal(result.shouldCheck, true)
})

test('gate asks for a Reddit check when a feed has no baseline', async () => {
  const now = '2026-10-22T12:00:00.000Z'
  const result = await decide(
    now,
    [],
    makeState(now, {}, { redditUserFeeds: { animecorner: FEEDS.animecorner } })
  )
  assert.equal(result.shouldCheck, true)
  assert.equal(result.redditCheck, true)
  assert.equal(result.fetches, 0)
})

// Friday 12:00 UTC: u/animecorner's posting window (opened 04:00 UTC) and a
// 15-minute poll slot; u/Abysswatcherbel is outside its window.
const FRIDAY_POLL = '2026-10-23T12:00:00.000Z'

function fridayState(animecorner: Partial<FeedStates[string]> = {}) {
  return makeState(
    FRIDAY_POLL,
    {},
    {
      redditUserFeeds: {
        ...FEEDS,
        animecorner: { ...FEEDS.animecorner, ...animecorner },
      },
    }
  )
}

test('gate asks for a Reddit check on a new matching post', async () => {
  const result = await decide(FRIDAY_POLL, [], fridayState(), [
    { id: 't3_new', title: 'Top 10 Anime of the Week' },
  ])
  assert.equal(result.shouldCheck, true)
  assert.equal(result.redditCheck, true)
  assert.equal(result.fetches, 1)
})

test('gate ignores new posts that do not match the feed title filter', async () => {
  const result = await decide(FRIDAY_POLL, [], fridayState(), [
    { id: 't3_new', title: 'Something else' },
  ])
  assert.equal(result.shouldCheck, false)
  assert.equal(result.fetches, 1)
})

test('gate ignores posts already seen', async () => {
  const result = await decide(FRIDAY_POLL, [], fridayState(), [
    { id: 't3_old', title: 'Top 10 old' },
  ])
  assert.equal(result.shouldCheck, false)
})

test('gate does not fetch Reddit outside a poll slot', async () => {
  const now = '2026-10-23T12:05:00.000Z'
  const result = await decide(now, [], makeState(now), [
    { id: 't3_new', title: 'Top 10 Anime' },
  ])
  assert.equal(result.shouldCheck, false)
  assert.equal(result.fetches, 0)
})

test('gate stops polling once this window’s post has been seen', async () => {
  const result = await decide(
    FRIDAY_POLL,
    [],
    fridayState({ lastPostPublishedAt: '2026-10-23T10:00:00.000Z' }),
    [{ id: 't3_new', title: 'Top 10 Anime' }]
  )
  assert.equal(result.shouldCheck, false)
  assert.equal(result.fetches, 0)
})

test('failing feed runs a full check once stale since the window opened', async () => {
  const result = await decide(
    FRIDAY_POLL,
    [],
    fridayState({ checkedAt: '2026-10-22T12:00:00.000Z' }),
    null
  )
  assert.equal(result.shouldCheck, true)
  assert.equal(result.redditCheck, true)
})

test('failing feed waits for the shared 6h staleness limit (was 2h)', async () => {
  const result = await decide(
    FRIDAY_POLL,
    [],
    fridayState({ checkedAt: '2026-10-23T09:00:00.000Z' }),
    null
  )
  assert.equal(result.shouldCheck, false)
  assert.equal(result.redditCheck, false)
})

test('failing feed does not rerun once the stale alert was sent', async () => {
  const result = await decide(
    FRIDAY_POLL,
    [],
    fridayState({
      checkedAt: '2026-10-23T05:00:00.000Z',
      errorAlertSentAt: '2026-10-23T06:00:00.000Z',
    }),
    null
  )
  assert.equal(result.shouldCheck, false)
})

test('failing feed reruns when the last alert predates the last success', async () => {
  const result = await decide(
    FRIDAY_POLL,
    [],
    fridayState({
      checkedAt: '2026-10-23T05:00:00.000Z',
      errorAlertSentAt: '2026-10-23T04:30:00.000Z',
    }),
    null
  )
  assert.equal(result.shouldCheck, true)
  assert.equal(result.redditCheck, true)
})

test('gate runs once a day for announcement checks in the 3 days before a drop', async () => {
  const now = '2026-10-20T15:00:00.000Z' // two days before ep 4's 15:00 drop
  const checkedAt = (hoursAgo: number) =>
    new Date(Date.parse(now) - hoursAgo * 60 * 60 * 1000).toISOString()
  const decideChecked = (hoursAgo: number) =>
    decide(
      now,
      [makeShow()],
      makeState(now, {
        show: { ...lastEpisode(3), announcementCheckedAt: checkedAt(hoursAgo) },
      })
    )

  const due = await decideChecked(23)
  assert.equal(due.shouldCheck, true)
  assert.match(due.reasons.join(' '), /Announced-break check/)
  assert.equal((await decideChecked(22)).shouldCheck, false)

  const early = '2026-10-19T14:00:00.000Z' // 3 days and an hour before
  assert.equal(
    (
      await decide(early, [makeShow()], {
        ...makeState(early, {}),
        shows: { show: lastEpisode(3) },
      })
    ).shouldCheck,
    false
  )
})

test('gate runs for the announcement check right after an episode drops', async () => {
  const now = '2026-10-15T18:00:00.000Z' // ep 3 dropped at 15:00, ep 4 is next
  const result = await decide(
    now,
    [makeShow()],
    makeState(now, {
      show: {
        ...lastEpisode(3),
        lastNotifiedAt: '2026-10-15T15:05:00.000Z',
        announcementCheckedAt: '2026-10-15T15:00:00.000Z',
      },
    })
  )
  assert.equal(result.shouldCheck, true)
  assert.match(result.reasons.join(' '), /Announced-break check/)
})
