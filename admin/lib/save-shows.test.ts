import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { installFakeGitHub, type FakeGitHub } from './fake-github'
import { removeShow, saveShow, ShowChangedError } from './save-shows'
import { showToForm } from './show-form'
import type { Show, ShowsFile } from '@shared/types'

function show(id: string): Show {
  return {
    id,
    title: id,
    provider: 'crunchyroll',
    schedule: {
      mode: 'ongoing',
      startAt: '2026-10-01T15:00:00.000Z',
      startEpisode: 1,
      episodeCount: null,
      premiereBatchSize: 1,
    },
  }
}

const realFetch = globalThis.fetch
let github: FakeGitHub

beforeEach(() => {
  github = installFakeGitHub({
    'shows.json': { shows: [show('frieren')] },
    'state.json': { shows: {} },
  })
})

afterEach(() => {
  globalThis.fetch = realFetch
})

test('saveShow replaces one show and keeps a concurrent edit to another', async () => {
  github.pushConcurrent('shows.json', () => ({
    shows: [show('frieren'), show('dandadan')],
  }))
  const loaded = showToForm(show('frieren'))

  await saveShow({ ...show('frieren'), title: 'Frieren S2' }, loaded)

  const saved = github.file<ShowsFile>('shows.json').shows
  assert.deepEqual(
    saved.map((entry) => [entry.id, entry.title]),
    [
      ['frieren', 'Frieren S2'],
      ['dandadan', 'dandadan'],
    ]
  )
  assert.deepEqual(
    github.commitsSinceStart().at(-1),
    'chore: 🧹 update frieren from admin CMS'
  )
})

test('saveShow refuses when the same show changed elsewhere', async () => {
  const loaded = showToForm(show('frieren'))
  github.pushConcurrent('shows.json', () => ({
    shows: [{ ...show('frieren'), malId: 52991 }],
  }))

  await assert.rejects(
    saveShow({ ...show('frieren'), title: 'Mine' }, loaded),
    ShowChangedError
  )
  assert.equal(github.file<ShowsFile>('shows.json').shows[0].malId, 52991)
})

test('saveShow adds a new show and refuses a duplicate ID', async () => {
  await saveShow(show('kaiju'), null)
  assert.deepEqual(
    github.file<ShowsFile>('shows.json').shows.map((entry) => entry.id),
    ['frieren', 'kaiju']
  )

  await assert.rejects(saveShow(show('kaiju'), null), /already exists/)
})

test('removeShow removes only that show, unless it changed elsewhere', async () => {
  github.pushConcurrent('shows.json', () => ({
    shows: [show('frieren'), { ...show('dandadan'), title: 'Dan Da Dan' }],
  }))

  await assert.rejects(
    removeShow(showToForm(show('dandadan'))),
    ShowChangedError
  )

  await removeShow(showToForm(show('frieren')))
  assert.deepEqual(
    github.file<ShowsFile>('shows.json').shows.map((entry) => entry.id),
    ['dandadan']
  )
})
