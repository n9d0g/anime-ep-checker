import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  appBadgeCount,
  dropPushPayload,
  isDropNotice,
  isTriggerAuthorized,
  pushToSubscriptions,
  testPushPayload,
  withDrops,
} from './app-badge'
import type {
  PushSendResult,
  PushSubscriptionJson,
  VapidKeys,
} from './web-push'

const ORIGIN = 'https://anime-ep-checker.dev'
const drop = {
  showId: 'frieren',
  showTitle: 'Frieren',
  episodeNumber: 6,
  episodeTitle: 'The Paper Village',
}

test('a drop push names the episode, opens its sheet and carries the count', () => {
  assert.deepEqual(JSON.parse(dropPushPayload(drop, 3, ORIGIN)), {
    web_push: 8030,
    notification: {
      title: 'Frieren',
      body: 'Episode 6 · The Paper Village',
      navigate: 'https://anime-ep-checker.dev/#show-frieren',
      lang: 'en-US',
      dir: 'ltr',
      app_badge: '3',
    },
  })
})

test('a drop push without an episode title says just the episode', () => {
  const payload = JSON.parse(
    dropPushPayload({ ...drop, episodeTitle: '  ' }, 1, ORIGIN)
  )
  assert.equal(payload.notification.body, 'Episode 6')
})

test('MAL down leaves app_badge out, so the badge keeps its number', () => {
  const payload = JSON.parse(dropPushPayload(drop, null, ORIGIN))
  assert.equal('app_badge' in payload.notification, false)
  assert.equal(payload.notification.title, 'Frieren')
})

test('nothing behind sends "0", which clears the badge', () => {
  const payload = JSON.parse(testPushPayload(0, ORIGIN))
  assert.equal(payload.notification.app_badge, '0')
  assert.equal(payload.notification.navigate, 'https://anime-ep-checker.dev/')
})

test('the test push describes the count', () => {
  assert.equal(
    JSON.parse(testPushPayload(1, ORIGIN)).notification.body,
    '1 show behind.'
  )
  assert.equal(
    JSON.parse(testPushPayload(4, ORIGIN)).notification.body,
    '4 shows behind.'
  )
  const down = JSON.parse(testPushPayload(null, ORIGIN))
  assert.equal('app_badge' in down.notification, false)
})

test("the run's drops are laid over the committed latest episodes", () => {
  assert.deepEqual(
    withDrops({ frieren: '5', dandadan: '4' }, [
      { showId: 'frieren', episodeNumber: 6 },
      { showId: 'dandadan', episodeNumber: 3 },
      { showId: 'kaiju', episodeNumber: 1 },
    ]),
    { frieren: 6, dandadan: '4', kaiju: 1 }
  )
})

test('the count is null while MAL is down', () => {
  assert.equal(
    appBadgeCount(
      ['frieren'],
      { frieren: '6' },
      { watchedByShowId: { frieren: 5 }, malDown: true }
    ),
    null
  )
  assert.equal(
    appBadgeCount(
      ['frieren'],
      { frieren: '6' },
      { watchedByShowId: { frieren: 5 }, malDown: false }
    ),
    1
  )
})

test('a gone subscription is removed; a failed one is kept', async () => {
  const subscription = (endpoint: string): PushSubscriptionJson => ({
    endpoint,
    keys: { p256dh: 'a', auth: 'b' },
  })
  const outcomes: Record<string, PushSendResult> = {
    'https://push.test/ok': { status: 'sent' },
    'https://push.test/gone': { status: 'gone' },
    'https://push.test/busy': { status: 'failed', httpStatus: 429, detail: '' },
  }
  const removed: string[] = []

  const result = await pushToSubscriptions(
    Object.keys(outcomes).map(subscription),
    'payload',
    {
      vapid: {} as VapidKeys,
      store: { remove: async (endpoint) => void removed.push(endpoint) },
      send: async (sub) => outcomes[sub.endpoint],
    }
  )

  assert.deepEqual(result, { sent: 1, removed: 1, failed: 1 })
  assert.deepEqual(removed, ['https://push.test/gone'])
})

test('drop notices need a show and an episode number', () => {
  assert.equal(isDropNotice(drop), true)
  assert.equal(isDropNotice({ ...drop, episodeTitle: null }), true)
  assert.equal(isDropNotice({ ...drop, episodeNumber: '6' }), false)
  assert.equal(isDropNotice({ ...drop, showId: '' }), false)
  assert.equal(isDropNotice(null), false)
})

test('the trigger needs the exact bearer secret', async () => {
  assert.equal(await isTriggerAuthorized('Bearer s3cret', 's3cret'), true)
  assert.equal(await isTriggerAuthorized('Bearer s3cre', 's3cret'), false)
  assert.equal(await isTriggerAuthorized('s3cret', 's3cret'), false)
  assert.equal(await isTriggerAuthorized(null, 's3cret'), false)
  assert.equal(await isTriggerAuthorized('Bearer ', ''), false)
  assert.equal(await isTriggerAuthorized('Bearer x', undefined), false)
})
