import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  countByCategory,
  matchSearchQuery,
  type SearchIndexItem,
} from './search'

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

test('countByCategory counts every list, empty ones as zero', () => {
  const item = (category: SearchIndexItem['category'], id: string) => ({
    category,
    id,
    title: id,
    href: '/',
  })
  assert.deepEqual(
    countByCategory([
      item('watching', 'a'),
      item('watching', 'b'),
      item('watched', 'c'),
    ]),
    { watching: 2, ptw: 0, on_hold: 0, watched: 1 }
  )
})
