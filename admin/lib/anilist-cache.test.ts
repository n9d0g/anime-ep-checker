import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ANILIST_CACHE_TTL_MS,
  mergeAniListAnswers,
  missingMalIds,
} from './anilist-cache'

const media = {
  bannerUrl: 'https://img/1',
  coverUrl: null,
  producers: [],
}

test('a cold cache is missing every ID, once each', () => {
  assert.deepEqual(missingMalIds({}, [1, 2, 2, 3], 0), [1, 2, 3])
})

test('a warm cache asks for nothing, including shows AniList lacks', () => {
  const cache = mergeAniListAnswers({}, [1, 2], { '1': media }, 1000)
  assert.deepEqual(cache['2'], { media: null, fetchedAt: 1000 })
  assert.deepEqual(missingMalIds(cache, [1, 2], 2000), [])
})

test('answers older than the TTL are asked for again', () => {
  const cache = mergeAniListAnswers({}, [1], { '1': media }, 0)
  assert.deepEqual(missingMalIds(cache, [1], ANILIST_CACHE_TTL_MS + 1), [1])
})
