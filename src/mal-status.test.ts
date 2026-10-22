import assert from 'node:assert/strict'
import { test } from 'node:test'
import { syncMalStatusAlerts } from './mal-status.ts'
import type { MalHealth } from './mal.ts'
import type { StateFile } from '../shared/types.ts'

const now = new Date('2026-10-21T12:00:00Z')

function run(state: StateFile, health: MalHealth) {
  return syncMalStatusAlerts({
    state,
    discord: {},
    now,
    probe: async () => health,
  })
}

test('records an outage the first time MAL is down', async () => {
  const state: StateFile = { shows: {} }
  const result = await run(state, 'down')
  assert.equal(result.changed, true)
  assert.equal(state.meta?.malDownSince, now.toISOString())
})

test('does not re-alert while MAL stays down', async () => {
  const since = '2026-10-21T11:00:00Z'
  const state: StateFile = { shows: {}, meta: { malDownSince: since } }
  const result = await run(state, 'down')
  assert.equal(result.changed, false)
  assert.equal(state.meta?.malDownSince, since)
})

test('clears the outage when MAL comes back', async () => {
  const state: StateFile = {
    shows: {},
    meta: { malDownSince: '2026-10-21T11:00:00Z' },
  }
  const result = await run(state, 'up')
  assert.equal(result.changed, true)
  assert.equal(state.meta?.malDownSince, null)
})

test('does nothing when MAL is up with no outage recorded', async () => {
  const state: StateFile = { shows: {} }
  const result = await run(state, 'up')
  assert.equal(result.changed, false)
  assert.equal(state.meta, undefined)
})

test('does nothing when MAL is not configured', async () => {
  const state: StateFile = {
    shows: {},
    meta: { malDownSince: '2026-10-21T11:00:00Z' },
  }
  const result = await run(state, 'not_configured')
  assert.equal(result.changed, false)
  assert.equal(state.meta?.malDownSince, '2026-10-21T11:00:00Z')
})
