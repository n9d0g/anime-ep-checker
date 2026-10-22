import type { ShowsFile, StateFile } from './types'

const GITHUB_API = 'https://api.github.com'

interface GitHubConfig {
  token: string
  repo: string
  branch: string
}

interface GitHubContentResponse {
  content: string
  sha: string
}

function getConfig(): GitHubConfig {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  const branch = process.env.GITHUB_BRANCH || 'main'

  if (!token || !repo) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPO must be set')
  }

  return { token, repo, branch }
}

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
}

/** GitHub answered a request with a non-2xx status. */
class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    body: string
  ) {
    super(`GitHub API ${status}: ${body}`)
  }
}

function isGithubConflictError(error: unknown): boolean {
  return (
    error instanceof GitHubApiError &&
    (error.status === 409 || error.status === 422)
  )
}

async function githubFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T | null> {
  const { token } = getConfig()
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Cache-Control': 'no-cache',
      'User-Agent': 'anime-ep-checker-admin',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new GitHubApiError(response.status, await response.text())
  }

  if (response.status === 204) return null
  return response.json() as Promise<T>
}

async function getRepoFileAtRef(path: string, ref: string) {
  const { repo } = getConfig()
  let data: GitHubContentResponse | null
  try {
    data = await githubFetch<GitHubContentResponse>(
      `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`
    )
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return null
    }
    throw error
  }

  if (!data) {
    return null
  }

  const content = JSON.parse(
    Buffer.from(data.content, 'base64').toString('utf8')
  )
  return { content, sha: data.sha }
}

async function getRepoFile(path: string) {
  return getRepoFileAtRef(path, getConfig().branch)
}

export async function getRepoFiles<T extends string>(paths: T[]) {
  const entries = await Promise.all(
    paths.map(async (path) => {
      const file = await getRepoFile(path)
      return { path, file }
    })
  )

  const result: Partial<Record<T, { content: unknown; sha: string | null }>> =
    {}

  for (const entry of entries) {
    result[entry.path as T] = entry.file
      ? { content: entry.file.content, sha: entry.file.sha }
      : { content: null, sha: null }
  }

  return { files: result }
}

export async function getShowsFile() {
  const data = await getRepoFile('shows.json')

  if (!data) {
    throw new Error('shows.json not found in repository')
  }

  return data
}

export async function getStateFile() {
  const data = await getRepoFile('state.json')

  if (!data) {
    return { content: { shows: {} }, sha: null as string | null }
  }

  return data
}

interface RepoFiles {
  'shows.json': ShowsFile
  'state.json': StateFile
}

type RepoPath = keyof RepoFiles

const MISSING_FILE_DEFAULTS: Partial<RepoFiles> = {
  'state.json': { shows: {} },
}

interface GitHubCommitResponse {
  sha: string
  commit: { tree: { sha: string } }
}

async function readRepoFileAtRef<P extends RepoPath>(
  path: P,
  ref: string
): Promise<{ content: RepoFiles[P]; version: string | null }> {
  const file = await getRepoFileAtRef(path, ref)
  if (file) return { content: file.content as RepoFiles[P], version: file.sha }

  const fallback = MISSING_FILE_DEFAULTS[path]
  if (!fallback) throw new Error(`${path} not found in repository`)
  return { content: structuredClone(fallback) as RepoFiles[P], version: null }
}

/** Blob SHA of each file: changes whenever the file's content changes. */
type RepoFileVersions<P extends RepoPath> = Record<P, string | null>

const UPDATE_ATTEMPTS = 3

type ApplyRepoUpdate<P extends RepoPath> = (
  files: Pick<RepoFiles, P>,
  versions: RepoFileVersions<P>
) => Partial<Pick<RepoFiles, P>> | null

interface RepoUpdateResult<P extends RepoPath> {
  committed: boolean
  /** File versions after the update (unchanged files keep their version). */
  versions: RepoFileVersions<P>
}

async function tryUpdateRepoFiles<P extends RepoPath>(
  paths: P[],
  apply: ApplyRepoUpdate<P>,
  message: string
): Promise<RepoUpdateResult<P> | 'conflict'> {
  const { repo, branch } = getConfig()

  const head = await githubFetch<GitHubCommitResponse>(
    `/repos/${repo}/commits/${encodeURIComponent(branch)}`
  )
  if (!head) throw new Error(`Could not resolve latest commit for ${branch}`)

  const files = {} as Pick<RepoFiles, P>
  const versions = {} as RepoFileVersions<P>
  await Promise.all(
    paths.map(async (path) => {
      const file = await readRepoFileAtRef(path, head.sha)
      files[path] = file.content
      versions[path] = file.version
    })
  )
  const updates = apply(files, { ...versions })
  if (!updates || Object.keys(updates).length === 0) {
    return { committed: false, versions }
  }

  const tree = await githubFetch<{
    sha: string
    tree: { path: string; sha: string }[]
  }>(`/repos/${repo}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_tree: head.commit.tree.sha,
      tree: Object.entries(updates).map(([path, content]) => ({
        path,
        mode: '100644',
        type: 'blob',
        content: JSON.stringify(content, null, 2) + '\n',
      })),
    }),
  })
  const commit = await githubFetch<{ sha: string }>(
    `/repos/${repo}/git/commits`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, tree: tree!.sha, parents: [head.sha] }),
    }
  )

  try {
    // Not forced: GitHub rejects the update if the branch moved since we read it.
    await githubFetch(`/repos/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commit!.sha, force: false }),
    })
  } catch (error) {
    if (isGithubConflictError(error)) return 'conflict'
    throw error
  }

  for (const entry of tree!.tree) {
    if (entry.path in updates) versions[entry.path as P] = entry.sha
  }
  return { committed: true, versions }
}

/**
 * Read-modify-write of repo files as one commit. `apply` gets fresh copies of
 * the files at the branch head and returns the files to write (or null to
 * write nothing). If another commit lands first, the files are re-read and
 * `apply` runs again, so it must be safe to repeat. `apply` also gets each
 * file's current version, for callers that reject stale edits.
 */
export async function updateRepoFiles<P extends RepoPath>(
  paths: P[],
  apply: ApplyRepoUpdate<P>,
  message: string
): Promise<RepoUpdateResult<P>> {
  for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt += 1) {
    const result = await tryUpdateRepoFiles(paths, apply, message)
    if (result !== 'conflict') return result
  }

  throw new Error(
    `Gave up writing ${paths.join(', ')} after repeated conflicts`
  )
}

export async function dispatchCheckWorkflow(force = true): Promise<void> {
  const { repo, branch } = getConfig()
  await githubFetch(
    `/repos/${repo}/actions/workflows/check-episodes.yml/dispatches`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ref: branch,
        inputs: { force: force ? 'true' : 'false' },
      }),
    }
  )
}
