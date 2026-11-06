import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sheetDragOffset, shouldDismissSheet } from './sheet-swipe'

test('a slow drag past a quarter of the sheet closes it', () => {
  assert.equal(
    shouldDismissSheet({ distance: 201, height: 800, velocity: 0.1 }),
    true
  )
})

test('a slow drag short of a quarter springs back', () => {
  assert.equal(
    shouldDismissSheet({ distance: 199, height: 800, velocity: 0.1 }),
    false
  )
})

test('a quick downward flick closes it, however short', () => {
  assert.equal(
    shouldDismissSheet({ distance: 30, height: 800, velocity: 0.6 }),
    true
  )
})

test('a flick back up after a long drag springs back', () => {
  assert.equal(
    shouldDismissSheet({ distance: 400, height: 800, velocity: -0.6 }),
    false
  )
})

test('dragging down follows the finger', () => {
  assert.equal(sheetDragOffset(120), 120)
})

test('dragging up is resisted', () => {
  const offset = sheetDragOffset(-100)
  assert.ok(offset < 0 && offset > -100)
})
