import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  replaceBootstrapShow,
  withoutBootstrapShow,
  withoutOnHoldEntry,
  withoutPtwEntry,
  type BootstrapCache,
} from './client-cache'
import type {
  OnHoldSnapshot,
  PlanToWatchSnapshotEntry,
  Show,
} from '@shared/types'

function show(id: string, title = id): Show {
  return { id, title } as Show
}

function ptwEntry(malId: number): PlanToWatchSnapshotEntry {
  return { malId, title: `Show ${malId}` } as PlanToWatchSnapshotEntry
}

function state(lastEpisodeNumber: string) {
  return { lastEpisodeNumber, lastEpisodeTitle: '', lastNotifiedAt: '' }
}

test('withoutPtwEntry drops the moved entry and keeps the rest', () => {
  const snapshot = {
    updatedAt: 'u',
    entries: [ptwEntry(1), ptwEntry(2), ptwEntry(3)],
  }

  const next = withoutPtwEntry(snapshot, 2)

  assert.deepEqual(
    next.entries.map((entry) => entry.malId),
    [1, 3]
  )
  assert.equal(next.updatedAt, 'u')
  assert.equal(snapshot.entries.length, 3)
})

test('withoutOnHoldEntry drops the restored show', () => {
  const snapshot: OnHoldSnapshot = {
    updatedAt: 'u',
    entries: [
      { show: show('a'), heldAt: 'h' },
      { show: show('b'), heldAt: 'h' },
    ],
  }

  const next = withoutOnHoldEntry(snapshot, 'a')

  assert.deepEqual(
    next.entries.map((entry) => entry.show.id),
    ['b']
  )
})

test('withoutBootstrapShow drops the show and its state', () => {
  const cache: BootstrapCache = {
    shows: [show('a'), show('b')],
    showStates: { a: state('3'), b: state('5') },
  }

  const next = withoutBootstrapShow(cache, 'a')

  assert.deepEqual(
    next.shows.map((item) => item.id),
    ['b']
  )
  assert.deepEqual(Object.keys(next.showStates), ['b'])
  assert.deepEqual(Object.keys(cache.showStates), ['a', 'b'])
})

test('replaceBootstrapShow swaps in the server copy of one show', () => {
  const cache: BootstrapCache = {
    shows: [show('a', 'old'), show('b')],
    showStates: { a: state('3') },
  }

  const next = replaceBootstrapShow(cache, show('a', 'new'))

  assert.deepEqual(
    next.shows.map((item) => item.title),
    ['new', 'b']
  )
  assert.equal(next.showStates, cache.showStates)
})
