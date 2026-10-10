import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mapOAuthListingToSubmissions } from './reddit.js'
import {
  applyRedditFeedFetchFailure,
  getRedditFeedWindowStart,
  isRedditFeedDue,
  isRedditFeedPollSlot,
  shouldSendFeedErrorAlert,
} from './reddit-feeds.js'

const FRIDAY = { postDays: [5] }
const SUNDAY = { postDays: [0] }

test('mapOAuthListingToSubmissions maps listing children to t3_ ids', () => {
  const posts = mapOAuthListingToSubmissions({
    data: {
      children: [
        {
          data: {
            id: '1wxgvpu',
            title: 'Karma Ranking | Week 1',
            permalink: '/r/anime/comments/1wxgvpu/week_1/',
            created_utc: Math.floor(
              new Date('2026-10-04T14:21:28.000Z').getTime() / 1000
            ),
            subreddit: 'anime',
          },
        },
      ],
    },
  })

  assert.equal(posts.length, 1)
  assert.equal(posts[0].id, 't3_1wxgvpu')
  assert.equal(posts[0].title, 'Karma Ranking | Week 1')
  assert.equal(
    posts[0].href,
    'https://www.reddit.com/r/anime/comments/1wxgvpu/week_1/'
  )
  assert.equal(posts[0].subreddit, 'anime')
  assert.equal(posts[0].published, '2026-10-04T14:21:28.000Z')
})

test('shouldSendFeedErrorAlert waits until success is stale', () => {
  const now = new Date('2026-10-05T20:00:00.000Z')
  const feedState = {
    checkedAt: '2026-10-05T16:00:00.000Z',
  }

  assert.equal(shouldSendFeedErrorAlert(feedState, now), false)
})

test('shouldSendFeedErrorAlert allows one warning after 6h without success', () => {
  const now = new Date('2026-10-05T20:00:00.000Z')
  const feedState = {
    checkedAt: '2026-10-05T13:00:00.000Z',
  }

  assert.equal(shouldSendFeedErrorAlert(feedState, now), true)
})

test('shouldSendFeedErrorAlert does not repeat until another successful check', () => {
  const now = new Date('2026-10-05T20:00:00.000Z')
  const feedState = {
    checkedAt: '2026-10-05T13:00:00.000Z',
    errorAlertSentAt: '2026-10-05T14:00:00.000Z',
  }

  assert.equal(shouldSendFeedErrorAlert(feedState, now), false)
})

test('applyRedditFeedFetchFailure sets lastErrorAt on first failure', () => {
  const feedState = {
    seenPostIds: ['t3_1'],
    checkedAt: '2026-10-01T15:30:59.628Z',
  }
  const checkedAt = '2026-10-06T12:40:00.000Z'

  const update = applyRedditFeedFetchFailure(feedState, checkedAt)

  assert.ok(update)
  assert.equal(update.state.lastErrorAt, checkedAt)
  assert.deepEqual(update.state.seenPostIds, feedState.seenPostIds)
  assert.equal(update.state.checkedAt, feedState.checkedAt)
})

test('applyRedditFeedFetchFailure is a no-op on repeated failure', () => {
  const feedState = {
    seenPostIds: ['t3_1'],
    checkedAt: '2026-10-01T15:30:59.628Z',
    lastErrorAt: '2026-10-05T19:00:00.000Z',
    errorAlertSentAt: '2026-10-05T19:05:00.000Z',
  }

  assert.equal(
    applyRedditFeedFetchFailure(feedState, '2026-10-06T12:40:00.000Z'),
    null
  )
})

test('applyRedditFeedFetchFailure updates errorAlertSentAt when a new alert fires', () => {
  const feedState = {
    seenPostIds: ['t3_1'],
    checkedAt: '2026-10-01T15:30:59.628Z',
    lastErrorAt: '2026-10-05T19:00:00.000Z',
  }
  const alertSentAt = '2026-10-06T08:00:00.000Z'

  const update = applyRedditFeedFetchFailure(
    feedState,
    '2026-10-06T12:40:00.000Z',
    alertSentAt
  )

  assert.ok(update)
  assert.equal(update.state.errorAlertSentAt, alertSentAt)
  assert.equal(update.state.lastErrorAt, feedState.lastErrorAt)
})

test('shouldSendFeedErrorAlert allows another warning after a new successful check', () => {
  const now = new Date('2026-10-06T08:00:00.000Z')
  const feedState = {
    checkedAt: '2026-10-06T00:00:00.000Z',
    errorAlertSentAt: '2026-10-05T14:00:00.000Z',
  }

  assert.equal(shouldSendFeedErrorAlert(feedState, now), true)
})

test('getRedditFeedWindowStart opens at Eastern midnight on the posting day', () => {
  // Fri Oct 9 2026, 00:30 EDT
  const start = getRedditFeedWindowStart(
    FRIDAY,
    new Date('2026-10-09T04:30:00.000Z')
  )
  assert.equal(start?.toISOString(), '2026-10-09T04:00:00.000Z')
})

test('getRedditFeedWindowStart is closed just before Eastern midnight', () => {
  // Thu Oct 8 2026, 23:59 EDT (already Friday in UTC)
  assert.equal(
    getRedditFeedWindowStart(FRIDAY, new Date('2026-10-09T03:59:00.000Z')),
    null
  )
})

test('getRedditFeedWindowStart covers the following grace day', () => {
  // Sat Oct 10 2026, 22:00 EDT
  const start = getRedditFeedWindowStart(
    FRIDAY,
    new Date('2026-10-11T02:00:00.000Z')
  )
  assert.equal(start?.toISOString(), '2026-10-09T04:00:00.000Z')
  // Sun Oct 11 2026, 00:30 EDT
  assert.equal(
    getRedditFeedWindowStart(FRIDAY, new Date('2026-10-11T04:30:00.000Z')),
    null
  )
})

test('getRedditFeedWindowStart uses EST after DST ends', () => {
  // Sun Nov 8 2026, 12:00 EST
  const start = getRedditFeedWindowStart(
    SUNDAY,
    new Date('2026-11-08T17:00:00.000Z')
  )
  assert.equal(start?.toISOString(), '2026-11-08T05:00:00.000Z')
})

test('isRedditFeedDue stops once a post from this window is seen', () => {
  const now = new Date('2026-10-09T20:00:00.000Z')
  assert.equal(isRedditFeedDue(FRIDAY, {}, now), true)
  assert.equal(
    isRedditFeedDue(
      FRIDAY,
      { lastPostPublishedAt: '2026-10-02T15:00:00.000Z' },
      now
    ),
    true
  )
  assert.equal(
    isRedditFeedDue(
      FRIDAY,
      { lastPostPublishedAt: '2026-10-09T15:00:00.000Z' },
      now
    ),
    false
  )
  assert.equal(isRedditFeedDue(SUNDAY, {}, now), false)
})

test('isRedditFeedPollSlot fires once per 15 minutes on a 5-minute cron', () => {
  const base = new Date('2026-10-09T15:00:00.000Z').getTime()
  const fired = [0, 5, 10, 15, 20, 25, 30].map((minutes) =>
    isRedditFeedPollSlot(new Date(base + minutes * 60 * 1000))
  )
  assert.deepEqual(fired, [true, false, false, true, false, false, true])
})

test('shouldSendFeedErrorAlert measures staleness from the window start', () => {
  const windowStart = new Date('2026-10-09T04:00:00.000Z')
  const feedState = { checkedAt: '2026-10-03T12:00:00.000Z' }

  assert.equal(
    shouldSendFeedErrorAlert(
      feedState,
      new Date('2026-10-09T06:00:00.000Z'),
      windowStart
    ),
    false
  )
  assert.equal(
    shouldSendFeedErrorAlert(
      feedState,
      new Date('2026-10-09T11:00:00.000Z'),
      windowStart
    ),
    true
  )
})
