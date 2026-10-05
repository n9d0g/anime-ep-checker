import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mapOAuthListingToSubmissions } from './reddit.js'
import { shouldSendFeedErrorAlert } from './reddit-feeds.js'

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

test('shouldSendFeedErrorAlert allows another warning after a new successful check', () => {
  const now = new Date('2026-10-06T08:00:00.000Z')
  const feedState = {
    checkedAt: '2026-10-06T00:00:00.000Z',
    errorAlertSentAt: '2026-10-05T14:00:00.000Z',
  }

  assert.equal(shouldSendFeedErrorAlert(feedState, now), true)
})
