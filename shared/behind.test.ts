import assert from 'node:assert/strict'
import { test } from 'node:test'
import { countBehindShows, isBehind } from './behind.ts'

test('a show is behind while MAL progress is short of the latest episode', () => {
  assert.equal(isBehind(3, '4'), true)
  assert.equal(isBehind(4, '4'), false)
  assert.equal(isBehind(5, 4), false)
  assert.equal(isBehind(0, '1'), true)
})

test('unknown progress or no episode yet is never behind', () => {
  assert.equal(isBehind(null, '4'), false)
  assert.equal(isBehind(undefined, '4'), false)
  assert.equal(isBehind(3, ''), false)
  assert.equal(isBehind(3, null), false)
  assert.equal(isBehind(3, 'abc'), false)
})

test('the count only includes listed shows that are behind', () => {
  assert.equal(
    countBehindShows(
      ['frieren', 'dandadan', 'kaiju', 'no-mal'],
      { frieren: '6', dandadan: '4', kaiju: '2', 'no-mal': '9', removed: '3' },
      { frieren: 5, dandadan: 4, kaiju: 0, 'no-mal': null, removed: 1 }
    ),
    2
  )
  assert.equal(countBehindShows([], {}, {}), 0)
})
