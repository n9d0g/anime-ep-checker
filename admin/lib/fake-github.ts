import { createHash } from 'node:crypto'

/** In-memory GitHub repo that speaks the subset of the REST API we use. */
export class FakeGitHub {
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
        sha: blobSha(content),
      })
    }

    if (method === 'POST' && path === '/git/trees') {
      const base = this.commits.get(body.base_tree)!.tree
      const tree = { ...base }
      for (const entry of body.tree) tree[entry.path] = entry.content
      const sha = `tree-${this.nextId++}`
      this.trees.set(sha, tree)
      return json(
        {
          sha,
          tree: Object.entries(tree).map(([path, content]) => ({
            path,
            type: 'blob',
            sha: blobSha(content),
          })),
        },
        201
      )
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

/** Content-addressed like git, so unchanged content keeps its version. */
export function blobSha(content: string): string {
  return createHash('sha1').update(content).digest('hex')
}

/** Points global fetch at a fresh fake repo with GitHub env configured. */
export function installFakeGitHub(files: Record<string, unknown>): FakeGitHub {
  process.env.GITHUB_TOKEN = 'token'
  process.env.GITHUB_REPO = 'owner/repo'
  process.env.GITHUB_BRANCH = 'main'
  const github = new FakeGitHub(files)
  globalThis.fetch = github.handle as typeof fetch
  return github
}
