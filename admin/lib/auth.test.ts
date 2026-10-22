import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSessionToken, verifySessionToken } from './auth'

const SECRET = 'session-secret'
const now = new Date('2026-10-22T12:00:00.000Z')

test('accepts a session token it issued', async () => {
  const token = await createSessionToken(SECRET, now)
  assert.equal(await verifySessionToken(token, SECRET, now), true)
})

test('never puts the password in the session token', async () => {
  process.env.ADMIN_PASSWORD = 'hunter2'
  const token = await createSessionToken(SECRET, now)
  assert.equal(token.includes('hunter2'), false)
})

test('rejects the old password cookie', async () => {
  assert.equal(await verifySessionToken('hunter2', SECRET, now), false)
})

test('rejects a token with a tampered timestamp or signature', async () => {
  const token = await createSessionToken(SECRET, now)
  const [issuedAt, signature] = token.split('.')
  const flipped = signature.startsWith('0') ? '1' : '0'

  assert.equal(
    await verifySessionToken(
      `${Number(issuedAt) + 1}.${signature}`,
      SECRET,
      now
    ),
    false
  )
  assert.equal(
    await verifySessionToken(
      `${issuedAt}.${flipped}${signature.slice(1)}`,
      SECRET,
      now
    ),
    false
  )
})

test('rejects a token signed with a different secret', async () => {
  const token = await createSessionToken('other-secret', now)
  assert.equal(await verifySessionToken(token, SECRET, now), false)
})

test('rejects a token older than the session lifetime', async () => {
  const token = await createSessionToken(SECRET, now)
  const later = new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000)
  assert.equal(await verifySessionToken(token, SECRET, later), false)
})
