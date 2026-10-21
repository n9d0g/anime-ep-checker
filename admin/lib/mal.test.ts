import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isMalOutageError } from './mal'

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
    isMalOutageError(new Error('MAL anime lookup failed (503): down')),
    true
  )
  assert.equal(
    isMalOutageError(new Error('MAL token refresh failed (502): bad gateway')),
    true
  )
})

test('does not treat 4xx or config errors as outages', () => {
  assert.equal(
    isMalOutageError(new Error('MAL anime lookup failed (404): not found')),
    false
  )
  assert.equal(
    isMalOutageError(new Error('MAL token refresh failed (401): invalid')),
    false
  )
  assert.equal(
    isMalOutageError(new Error('MAL_REFRESH_TOKEN must be set')),
    false
  )
})
