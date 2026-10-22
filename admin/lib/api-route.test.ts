import assert from 'node:assert/strict'
import { test } from 'node:test'
import { errorMessage, parseMalId } from './api-route'

test('accepts positive MAL IDs', () => {
  assert.equal(parseMalId(1), 1)
  assert.equal(parseMalId(52991), 52991)
})

test('rejects missing, non-numeric, and non-positive MAL IDs', () => {
  for (const value of [undefined, null, '5', Number.NaN, Infinity, 0, -3]) {
    assert.throws(() => parseMalId(value), {
      message: 'malId must be a positive number',
    })
  }
})

test('error messages fall back for non-Error throws', () => {
  assert.equal(errorMessage(new Error('boom')), 'boom')
  assert.equal(errorMessage('boom'), 'Unknown error')
  assert.equal(errorMessage(null, 'Failed to add break'), 'Failed to add break')
})
