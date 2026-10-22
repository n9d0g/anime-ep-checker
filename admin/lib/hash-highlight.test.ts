import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createHighlightTracker,
  hashOf,
  malIdFromElementId,
  pathOf,
  targetIdFromHash,
} from './hash-highlight'

test('targetIdFromHash reads a show anchor and ignores anything else', () => {
  assert.equal(targetIdFromHash('#show-frieren'), 'show-frieren')
  assert.equal(targetIdFromHash('#show-52991'), 'show-52991')
  assert.equal(targetIdFromHash('#show-'), null)
  assert.equal(targetIdFromHash('#top'), null)
  assert.equal(targetIdFromHash(''), null)
})

test('pathOf and hashOf split a search result link', () => {
  assert.equal(pathOf('/on-hold#show-a'), '/on-hold')
  assert.equal(hashOf('/on-hold#show-a'), '#show-a')
  assert.equal(pathOf('/#show-a'), '/')
  assert.equal(hashOf('/ptw'), '')
})

test('a cold load waits for the list to render, then highlights once', () => {
  const tracker = createHighlightTracker()
  tracker.request('#show-a')

  // Skeleton on screen: the row does not exist yet.
  assert.equal(
    tracker.take(() => false),
    null
  )
  assert.equal(tracker.pending(), 'show-a')

  // Data loaded and the row rendered.
  assert.equal(
    tracker.take((id) => id === 'show-a'),
    'show-a'
  )
  // Later renders (refreshes) do not highlight again.
  assert.equal(
    tracker.take(() => true),
    null
  )
  assert.equal(tracker.pending(), null)
})

test('a new request on the same page highlights again, even for the same row', () => {
  const tracker = createHighlightTracker()
  tracker.request('#show-a')
  assert.equal(
    tracker.take(() => true),
    'show-a'
  )

  tracker.request('#show-b')
  assert.equal(
    tracker.take(() => true),
    'show-b'
  )

  tracker.request('#show-b')
  assert.equal(
    tracker.take(() => true),
    'show-b'
  )
})

test('a hash that is not a show anchor clears any pending highlight', () => {
  const tracker = createHighlightTracker()
  tracker.request('#show-a')
  tracker.request('')

  assert.equal(tracker.pending(), null)
  assert.equal(
    tracker.take(() => true),
    null
  )
})

test('malIdFromElementId reads MAL-keyed rows only', () => {
  assert.equal(malIdFromElementId('show-52991'), 52991)
  assert.equal(malIdFromElementId('show-frieren'), null)
  assert.equal(malIdFromElementId('show-1a'), null)
})
