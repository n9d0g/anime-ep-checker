import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAnimeDiscussionSearchUrl } from './reddit.ts'

test('the discussion search covers all of Reddit, newest first', () => {
  const url = new URL(
    buildAnimeDiscussionSearchUrl(
      'Kusuriya no Hitorigoto 3rd Season',
      8,
      'the_apothecary_diaries_season_3_kusuriya_no_hitorigoto_season_3'
    )
  )

  assert.equal(url.origin + url.pathname, 'https://www.reddit.com/search/')
  assert.equal(url.searchParams.get('restrict_sr'), null)
  assert.equal(url.searchParams.get('sort'), 'new')
  assert.equal(
    url.searchParams.get('q'),
    'the_apothecary_diaries_season_3_kusuriya_no_hitorigoto_season_3_-_episode_8_discussion'
  )
})
