import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { getRepoFiles, getStateFile, updateRepoFiles } from './github'
import type { ShowsFile, StateFile } from './types'

/** In-memory GitHub repo that speaks the subset of the REST API we use. */
class FakeGitHub {
  commits = new Map<
    string,
    { tree: Record<string, string>; parent: string | null; message: string }
  >()
  trees = new Map<string, Record<string, string>>()
  head: string
  calls: string[] = []
  /** Runs just before a ref update is applied, e.g. to land a concurrent commit. */
  beforeRefUpdate: (() => void) | null = null
  failCommitCreate = false
  private nextId = 0

  constructor(files: Record<string, unknown>) {
    const tree = Object.fromEntries(
      Object.entries(files).map(([path, value]) => [
        path,
        JSON.stringify(value, null, 2) + '\n',
      ])
    )
    this.head = this.addCommit(tree, null, 'initial')
  }

  addCommit(
    tree: Record<string, string>,
    parent: string | null,
    message: string
  ): string {
    const sha = `commit-${this.nextId++}`
    this.commits.set(sha, { tree, parent, message })
    return sha
  }

  /** Commits a change on the branch, as another writer would. */
  pushConcurrent(path: string, change: (content: any) => unknown) {
    const tree = { ...this.commits.get(this.head)!.tree }
    tree[path] = JSON.stringify(change(JSON.parse(tree[path])), null, 2) + '\n'
    this.head = this.addCommit(tree, this.head, 'concurrent')
  }

  file<T>(path: string): T {
    return JSON.parse(this.commits.get(this.head)!.tree[path]) as T
  }

  commitsSinceStart(): string[] {
    const messages: string[] = []
    let sha: string | null = this.head
    while (sha) {
      const commit: { parent: string | null; message: string } =
        this.commits.get(sha)!
      if (commit.parent) messages.unshift(commit.message)
      sha = commit.parent
    }
    return messages
  }

  handle = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    const path = url.pathname.replace('/repos/owner/repo', '')
    const body = init?.body ? JSON.parse(String(init.body)) : null
    this.calls.push(`${method} ${path}`)

    if (method === 'GET' && path === '/commits/main') {
      return json({ sha: this.head, commit: { tree: { sha: this.head } } })
    }

    if (method === 'GET' && path.startsWith('/contents/')) {
      const ref = url.searchParams.get('ref')!
      const sha = ref === 'main' ? this.head : ref
      const content = this.commits.get(sha)?.tree[path.slice(10)]
      if (content === undefined) return json({ message: 'Not Found' }, 404)
      return json({
        content: Buffer.from(content).toString('base64'),
        sha: `blob-${sha}`,
      })
    }

    if (method === 'POST' && path === '/git/trees') {
      const base = this.commits.get(body.base_tree)!.tree
      const tree = { ...base }
      for (const entry of body.tree) tree[entry.path] = entry.content
      const sha = `tree-${this.nextId++}`
      this.trees.set(sha, tree)
      return json({ sha }, 201)
    }

    if (method === 'POST' && path === '/git/commits') {
      if (this.failCommitCreate) return json({ message: 'boom' }, 500)
      const sha = this.addCommit(
        this.trees.get(body.tree)!,
        body.parents[0],
        body.message
      )
      return json({ sha }, 201)
    }

    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      this.beforeRefUpdate?.()
      this.beforeRefUpdate = null
      const parent = this.commits.get(body.sha)!.parent
      if (parent !== this.head && !body.force) {
        return json({ message: 'Update is not a fast forward' }, 422)
      }
      this.head = body.sha
      return json({ object: { sha: body.sha } })
    }

    return json({ message: `Unhandled ${method} ${path}` }, 500)
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

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
  process.env.GITHUB_TOKEN = 'token'
  process.env.GITHUB_REPO = 'owner/repo'
  process.env.GITHUB_BRANCH = 'main'
  github = new FakeGitHub({
    'shows.json': initialShows,
    'state.json': initialState,
  })
  globalThis.fetch = github.handle as typeof fetch
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
