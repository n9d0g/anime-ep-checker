import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchSearchQuery } from './search'

test('matchSearchQuery matches English title ignoring punctuation', () => {
  assert.equal(
    matchSearchQuery('apothecary', {
      title: 'Kusuriya no Hitorigoto 3rd Season',
      titleEnglish: 'The Apothecary Diaries Season 3',
    }),
    true
  )
})

test('matchSearchQuery matches primary title', () => {
  assert.equal(
    matchSearchQuery('ao no hako', {
      title: 'Ao no Hako Season 2',
      titleEnglish: 'Blue Box Season 2',
    }),
    true
  )
})

test('matchSearchQuery returns false for empty query', () => {
  assert.equal(
    matchSearchQuery('', {
      title: 'Bleach',
      titleEnglish: 'Bleach',
    }),
    false
  )
})
