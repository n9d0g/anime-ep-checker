import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { ApiError, apiFetch } from './api-fetch'

const realFetch = globalThis.fetch
const calls: { input: RequestInfo | URL; init?: RequestInit }[] = []

function stubFetch(response: Response) {
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init })
    return response
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  globalThis.fetch = realFetch
  calls.length = 0
})

test('apiFetch returns the parsed JSON body of an OK response', async () => {
  stubFetch(jsonResponse({ items: [1, 2] }))

  const data = await apiFetch<{ items: number[] }>('/api/x', {
    errorMessage: 'Failed to load x',
  })

  assert.deepEqual(data, { items: [1, 2] })
})

test('apiFetch never answers from the HTTP cache', async () => {
  stubFetch(jsonResponse({}))

  await apiFetch('/api/x', { errorMessage: 'Failed' })

  assert.equal(calls[0].input, '/api/x')
  assert.equal(calls[0].init?.cache, 'no-store')
})

test('apiFetch sends a json option as a JSON body', async () => {
  stubFetch(jsonResponse({ ok: true }))

  await apiFetch('/api/x', {
    method: 'POST',
    json: { showId: 'a' },
    errorMessage: 'Failed',
  })

  const init = calls[0].init
  assert.equal(init?.method, 'POST')
  assert.equal(init?.body, JSON.stringify({ showId: 'a' }))
  assert.equal(
    new Headers(init?.headers).get('Content-Type'),
    'application/json'
  )
})

test('apiFetch throws the error the server gave on a non-OK response', async () => {
  stubFetch(jsonResponse({ error: 'shows.json changed', current: 3 }, 409))

  await assert.rejects(
    apiFetch('/api/x', { errorMessage: 'Failed to save' }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.message, 'shows.json changed')
      assert.equal(error.status, 409)
      assert.deepEqual(error.data, { error: 'shows.json changed', current: 3 })
      return true
    }
  )
})

test('apiFetch falls back to its error message when the JSON has none', async () => {
  stubFetch(jsonResponse({}, 500))

  await assert.rejects(apiFetch('/api/x', { errorMessage: 'Failed to save' }), {
    message: 'Failed to save',
  })
})

test('apiFetch reports the status when an error body is not JSON', async () => {
  stubFetch(
    new Response('<html><body>502 Bad Gateway</body></html>', {
      status: 502,
      headers: { 'Content-Type': 'text/html' },
    })
  )

  await assert.rejects(
    apiFetch('/api/x', { errorMessage: 'Failed to load shows' }),
    (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.message, 'Failed to load shows (HTTP 502)')
      assert.equal(error.status, 502)
      assert.equal(error.data, null)
      return true
    }
  )
})

test('apiFetch reports an OK response that is not JSON instead of a parse error', async () => {
  stubFetch(new Response('<html>login</html>', { status: 200 }))

  await assert.rejects(
    apiFetch('/api/x', { errorMessage: 'Failed to load shows' }),
    { message: 'Failed to load shows (unexpected response, HTTP 200)' }
  )
})

test('apiFetch treats an empty OK body as an empty object', async () => {
  stubFetch(new Response(null, { status: 204 }))

  assert.deepEqual(await apiFetch('/api/x', { errorMessage: 'Failed' }), {})
})
