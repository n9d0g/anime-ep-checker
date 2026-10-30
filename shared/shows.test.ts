import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getOfficialNewsUrl } from './shows.ts'

test("the official news URL override wins over AniList's link", () => {
  const anilist = 'https://frieren-anime.jp/'
  assert.equal(
    getOfficialNewsUrl(
      { officialNewsUrl: 'https://frieren-anime.jp/news/' },
      anilist
    ),
    'https://frieren-anime.jp/news/'
  )
  assert.equal(getOfficialNewsUrl({ officialNewsUrl: '  ' }, anilist), anilist)
  assert.equal(getOfficialNewsUrl({}, null), null)
  assert.equal(getOfficialNewsUrl({}, undefined), null)
})
