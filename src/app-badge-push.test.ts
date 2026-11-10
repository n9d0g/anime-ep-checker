import assert from 'node:assert/strict'
import { test } from 'node:test'
import { notifyAppBadgeDrop } from './app-badge-push.ts'

const drop = {
  showId: 'frieren',
  showTitle: 'Frieren',
  episodeNumber: 6,
  episodeTitle: 'The Paper Village',
}
const config = { url: 'https://admin.test/api/push/drop', secret: 's3cret' }

test('the drop and the run so far go to the Worker with the bearer secret', async () => {
  let seen: { url: string; init: RequestInit } | undefined
  const result = await notifyAppBadgeDrop(
    config,
    drop,
    [{ ...drop, showId: 'dandadan', episodeNumber: 4 }],
    (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response('{}', { status: 200 })
    }) as typeof fetch
  )

  assert.equal(result, 'sent')
  assert.equal(seen!.url, config.url)
  assert.equal(
    (seen!.init.headers as Record<string, string>).Authorization,
    'Bearer s3cret'
  )
  assert.deepEqual(JSON.parse(seen!.init.body as string), {
    drop,
    runDrops: [{ ...drop, showId: 'dandadan', episodeNumber: 4 }],
  })
})

test('without a secret nothing is sent', async () => {
  const result = await notifyAppBadgeDrop(
    { url: config.url },
    drop,
    [],
    (async () => {
      throw new Error('should not fetch')
    }) as typeof fetch
  )
  assert.equal(result, 'not_configured')
})

test('an unreachable or failing Worker never throws', async () => {
  const unreachable = await notifyAppBadgeDrop(config, drop, [], (async () => {
    throw new TypeError('fetch failed')
  }) as typeof fetch)
  assert.equal(unreachable, 'failed')

  const failing = await notifyAppBadgeDrop(
    config,
    drop,
    [],
    (async () => new Response('boom', { status: 500 })) as typeof fetch
  )
  assert.equal(failing, 'failed')
})
