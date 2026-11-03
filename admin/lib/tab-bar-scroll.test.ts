import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  initialTabBarScroll,
  nextTabBarScroll,
  type TabBarScrollState,
} from './tab-bar-scroll'

const PAGE = { viewportHeight: 800, pageHeight: 5000 }

function scrollThrough(start: number, positions: number[]): TabBarScrollState {
  let state = initialTabBarScroll(start)
  for (const scrollY of positions) {
    state = nextTabBarScroll(state, { ...PAGE, scrollY })
  }
  return state
}

test('scrolling down past the threshold shrinks the bar', () => {
  assert.equal(scrollThrough(100, [104]).compact, false)
  assert.equal(scrollThrough(100, [108]).compact, true)
})

test('small movements add up until they cross the threshold', () => {
  assert.equal(scrollThrough(100, [103, 106, 109]).compact, true)
})

test('scrolling up past the threshold grows the bar back', () => {
  assert.equal(scrollThrough(100, [400, 395]).compact, true)
  assert.equal(scrollThrough(100, [400, 392]).compact, false)
})

test('a reversal is measured from where it began, not from the last change', () => {
  // Shrinks at 108, keeps going down to 600, then comes back up 8px.
  assert.equal(scrollThrough(100, [108, 300, 600, 592]).compact, false)
})

test('the bar is full size near the top of the page', () => {
  assert.equal(scrollThrough(0, [12]).compact, false)
  assert.equal(scrollThrough(100, [300, 10]).compact, false)
})

test('the bar is full size near the bottom of the page', () => {
  // 4190 + 800 = 4990, within 16px of the 5000px page.
  assert.equal(scrollThrough(100, [3000, 4190]).compact, false)
})

test('a page shorter than the viewport never shrinks the bar', () => {
  const state = nextTabBarScroll(initialTabBarScroll(0), {
    scrollY: 40,
    viewportHeight: 800,
    pageHeight: 700,
  })
  assert.equal(state.compact, false)
})
