import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { installFakeGitHub, type FakeGitHub } from './fake-github'
import { getRepoFiles, getStateFile, updateRepoFiles } from './github'
import type { ShowsFile, StateFile } from './types'

const realFetch = globalThis.fetch
let github: FakeGitHub

const initialShows: ShowsFile = { shows: [] }
const initialState: StateFile = {
  shows: {
    frieren: {
      lastEpisodeId: 'ep-3',
      lastEpisodeNumber: '3',
      lastEpisodeTitle: 'Third',
      lastNotifiedAt: '2026-10-14T15:00:00.000Z',
      seasonId: 'season-1',
      seasonTitle: 'Season 1',
    },
  },
}

beforeEach(() => {
  github = installFakeGitHub({
    'shows.json': initialShows,
    'state.json': initialState,
  })
})

afterEach(() => {
  globalThis.fetch = realFetch
})

test('writes changes to both files in a single commit', async () => {
  await updateRepoFiles(
    ['shows.json', 'state.json'],
    (files) => {
      files['state.json'].shows.frieren.lastEpisodeNumber = '4'
      files['shows.json'].shows = []
      return {
        'shows.json': { shows: [] },
        'state.json': files['state.json'],
      }
    },
    'chore: test change'
  )

  assert.deepEqual(github.commitsSinceStart(), ['chore: test change'])
  assert.equal(
    github.file<StateFile>('state.json').shows.frieren.lastEpisodeNumber,
    '4'
  )
})

test('re-reads and re-applies the change when another commit lands first', async () => {
  github.beforeRefUpdate = () =>
    github.pushConcurrent('state.json', (state: StateFile) => {
      state.shows.frieren.lastEpisodeNumber = '4'
      return state
    })
  let applyCount = 0

  await updateRepoFiles(
    ['state.json'],
    (files) => {
      applyCount += 1
      const state = files['state.json']
      state.meta = { ...state.meta, planToWatchCheckedAt: '2026-10-22' }
      return { 'state.json': state }
    },
    'chore: admin change'
  )

  assert.equal(applyCount, 2)
  assert.deepEqual(github.commitsSinceStart(), [
    'concurrent',
    'chore: admin change',
  ])
  const state = github.file<StateFile>('state.json')
  assert.equal(state.shows.frieren.lastEpisodeNumber, '4')
  assert.equal(state.meta?.planToWatchCheckedAt, '2026-10-22')
})

test('changes neither file when the commit fails', async () => {
  github.failCommitCreate = true

  await assert.rejects(
    updateRepoFiles(
      ['shows.json', 'state.json'],
      (files) => {
        files['state.json'].shows = {}
        return {
          'shows.json': { shows: [] },
          'state.json': files['state.json'],
        }
      },
      'chore: doomed'
    ),
    /GitHub API 500/
  )

  assert.deepEqual(github.commitsSinceStart(), [])
  assert.deepEqual(github.file('state.json'), initialState)
})

test('reads each file with a single GitHub call', async () => {
  const state = await getStateFile()
  assert.deepEqual(state.content, initialState)
  assert.equal(github.calls.length, 1)

  github.calls = []
  await getRepoFiles(['shows.json', 'state.json'])
  assert.equal(github.calls.length, 2)
})
