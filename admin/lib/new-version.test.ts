import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newerVersion } from './new-version'

const served = (version?: string) =>
  new Headers(version ? { 'X-App-Version': version } : {})

test('newerVersion is the live version when it differs from the running one', () => {
  assert.equal(newerVersion(served('0.3.0'), '0.2.0'), '0.3.0')
})

test('newerVersion is null when up to date, unknown, or in dev', () => {
  assert.equal(newerVersion(served('0.2.0'), '0.2.0'), null)
  assert.equal(newerVersion(served(), '0.2.0'), null)
  assert.equal(newerVersion(served('0.3.0-dev'), '0.2.0-dev'), null)
  assert.equal(newerVersion(served('0.3.0'), '0.2.0-dev'), null)
})
