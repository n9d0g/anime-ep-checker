import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  fetchMalPages,
  isMalOutageError,
  MalConfigError,
  MalHttpError,
} from './mal'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

test('treats network failures, timeouts, and maintenance pages as outages', () => {
  assert.equal(isMalOutageError(new TypeError('fetch failed')), true)
  assert.equal(
    isMalOutageError(new DOMException('timed out', 'TimeoutError')),
    true
  )
  assert.equal(isMalOutageError(new SyntaxError('Unexpected token <')), true)
})

test('treats MAL 5xx responses as outages', () => {
  assert.equal(
    isMalOutageError(new MalHttpError('MAL anime lookup', 503, 'down')),
    true
  )
  assert.equal(
    isMalOutageError(new MalHttpError('MAL token refresh', 502, 'bad gateway')),
    true
  )
})

test('does not treat 4xx or config errors as outages', () => {
  assert.equal(
    isMalOutageError(new MalHttpError('MAL anime lookup', 404, 'not found')),
    false
  )
  assert.equal(
    isMalOutageError(new MalHttpError('MAL token refresh', 401, 'invalid')),
    false
  )
  assert.equal(
    isMalOutageError(new MalConfigError('MAL_REFRESH_TOKEN must be set')),
    false
  )
})

test('does not read the status out of plain error text', () => {
  assert.equal(
    isMalOutageError(new Error('MAL anime lookup failed (503): down')),
    false
  )
})

test('MAL HTTP errors keep the status in their message', () => {
  const error = new MalHttpError('MAL anime lookup', 404, 'not found')
  assert.equal(error.message, 'MAL anime lookup failed (404): not found')
  assert.equal(error.status, 404)
})

test('fetches every page and joins their items', async () => {
  const calls: { url: string; auth: string | null }[] = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({
      url,
      auth: new Headers(init?.headers).get('Authorization'),
    })
    const page =
      url === 'https://mal.test/list'
        ? {
            data: [{ id: 1 }, { id: 2 }],
            paging: { next: 'https://mal.test/2' },
          }
        : { data: [{ id: 3 }] }
    return Response.json(page)
  }) as typeof fetch

  const items = await fetchMalPages<{ id: number }>(
    'token',
    'https://mal.test/list',
    'MAL test lookup'
  )

  assert.deepEqual(items, [{ id: 1 }, { id: 2 }, { id: 3 }])
  assert.deepEqual(calls, [
    { url: 'https://mal.test/list', auth: 'Bearer token' },
    { url: 'https://mal.test/2', auth: 'Bearer token' },
  ])
})

test('treats a page without data as empty', async () => {
  globalThis.fetch = (async () => Response.json({})) as typeof fetch

  assert.deepEqual(
    await fetchMalPages('token', 'https://mal.test/list', 'MAL test lookup'),
    []
  )
})

test('a failed page throws an HTTP error with the lookup name', async () => {
  globalThis.fetch = (async () =>
    new Response('busy', { status: 503 })) as typeof fetch

  await assert.rejects(
    fetchMalPages('token', 'https://mal.test/list', 'MAL test lookup'),
    (error) => {
      assert.ok(error instanceof MalHttpError)
      assert.equal(error.status, 503)
      assert.equal(error.message, 'MAL test lookup failed (503): busy')
      return true
    }
  )
})
