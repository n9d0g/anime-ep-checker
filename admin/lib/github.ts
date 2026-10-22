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

function isGithubConflictError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('GitHub API 409') || message.includes('GitHub API 422')
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
    const body = await response.text()
    throw new Error(`GitHub API ${response.status}: ${body}`)
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
    if (error instanceof Error && error.message.startsWith('GitHub API 404')) {
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

export interface RepoFiles {
  'shows.json': ShowsFile
  'state.json': StateFile
}

export type RepoPath = keyof RepoFiles

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
): Promise<RepoFiles[P]> {
  const file = await getRepoFileAtRef(path, ref)
  if (file) return file.content as RepoFiles[P]

  const fallback = MISSING_FILE_DEFAULTS[path]
  if (!fallback) throw new Error(`${path} not found in repository`)
  return structuredClone(fallback) as RepoFiles[P]
}

const UPDATE_ATTEMPTS = 3

type ApplyRepoUpdate<P extends RepoPath> = (
  files: Pick<RepoFiles, P>
) => Partial<Pick<RepoFiles, P>> | null

async function tryUpdateRepoFiles<P extends RepoPath>(
  paths: P[],
  apply: ApplyRepoUpdate<P>,
  message: string
): Promise<'committed' | 'unchanged' | 'conflict'> {
  const { repo, branch } = getConfig()

  const head = await githubFetch<GitHubCommitResponse>(
    `/repos/${repo}/commits/${encodeURIComponent(branch)}`
  )
  if (!head) throw new Error(`Could not resolve latest commit for ${branch}`)

  const entries = await Promise.all(
    paths.map(async (path) => [path, await readRepoFileAtRef(path, head.sha)])
  )
  const updates = apply(Object.fromEntries(entries) as Pick<RepoFiles, P>)
  if (!updates || Object.keys(updates).length === 0) return 'unchanged'

  const tree = await githubFetch<{ sha: string }>(`/repos/${repo}/git/trees`, {
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
  return 'committed'
}

/**
 * Read-modify-write of repo files as one commit. `apply` gets fresh copies of
 * the files at the branch head and returns the files to write (or null to
 * write nothing). If another commit lands first, the files are re-read and
 * `apply` runs again, so it must be safe to repeat. Returns whether a commit
 * was made.
 */
export async function updateRepoFiles<P extends RepoPath>(
  paths: P[],
  apply: ApplyRepoUpdate<P>,
  message: string
): Promise<boolean> {
  for (let attempt = 0; attempt < UPDATE_ATTEMPTS; attempt += 1) {
    const result = await tryUpdateRepoFiles(paths, apply, message)
    if (result !== 'conflict') return result === 'committed'
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

export { slugify } from './slugify'

export function parseSeriesIdFromUrl(url: string): string | null {
  const match = String(url).match(/\/series\/([A-Z0-9]+)/i)
  return match ? match[1].toUpperCase() : null
}

export function parseNetflixIdFromUrl(url: string): string | null {
  const match = String(url).match(/\/title\/(\d+)/i)
  return match ? match[1] : null
}

export function parseDisneyIdFromUrl(url: string): string | null {
  const entityMatch = String(url).match(
    /\/browse\/entity-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  )
  if (entityMatch) {
    return entityMatch[1]
  }

  const seriesMatch = String(url).match(
    /\/series\/[a-z0-9-]+\/([a-zA-Z0-9-]+)/i
  )
  return seriesMatch ? seriesMatch[1] : null
}
