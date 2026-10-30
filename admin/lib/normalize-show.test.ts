import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Show } from '@shared/types'

const SHOW: Show = {
  id: 'frieren',
  title: 'Frieren',
  provider: 'crunchyroll',
  crunchyrollUrl: 'https://www.crunchyroll.com/series/GG5H5XQX4/frieren',
  seriesId: 'GG5H5XQX4',
  schedule: {
    mode: 'finite',
    startAt: '2026-09-01T15:00:00.000Z',
    startEpisode: 1,
    episodeCount: 12,
    premiereBatchSize: 1,
  },
}

test('the official news URL round-trips through the edit form', async () => {
  const { showToForm } = await import('./show-form')
  const { normalizeShow } = await import('./normalize-show')
  const withUrl = { ...SHOW, officialNewsUrl: 'https://frieren-anime.jp/news/' }
  assert.deepEqual(normalizeShow(showToForm(withUrl)), withUrl)

  const blank = { ...showToForm(SHOW), officialNewsUrl: '  ' }
  assert.equal('officialNewsUrl' in normalizeShow(blank), false)

  assert.throws(
    () =>
      normalizeShow({
        ...showToForm(SHOW),
        officialNewsUrl: 'frieren-anime.jp',
      }),
    /Official news URL must be a web address/
  )
})
