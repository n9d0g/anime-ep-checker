import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { blobSha, installFakeGitHub, type FakeGitHub } from './fake-github'
import { getRepoFiles } from './github'
import { saveShowsList, ShowsChangedError } from './save-shows'
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

async function loadedVersion(): Promise<string> {
  const { files } = await getRepoFiles(['shows.json'])
  return files['shows.json']!.sha!
}

test('rejects a save made from an outdated shows list without writing', async () => {
  const version = await loadedVersion()
  github.pushConcurrent('shows.json', () => ({
    shows: [show('frieren'), show('dandadan')],
  }))

  await assert.rejects(
    saveShowsList([show('frieren'), show('kaiju')], version),
    ShowsChangedError
  )

  assert.deepEqual(
    github.file<ShowsFile>('shows.json').shows.map((entry) => entry.id),
    ['frieren', 'dandadan']
  )
})

test('saves from the current version and returns the new one', async () => {
  const version = await loadedVersion()

  const result = await saveShowsList([show('frieren'), show('kaiju')], version)

  const saved = github.file<ShowsFile>('shows.json')
  assert.deepEqual(
    saved.shows.map((entry) => entry.id),
    ['frieren', 'kaiju']
  )
  assert.deepEqual(result.removedIds, [])
  assert.equal(result.version, blobSha(JSON.stringify(saved, null, 2) + '\n'))
})
