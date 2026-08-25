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

interface GitHubRefResponse {
  object: {
    sha: string
  }
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

export function isGithubConflictError(error: unknown): boolean {
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

async function getBranchHeadSha(): Promise<string> {
  const { repo, branch } = getConfig()
  const data = await githubFetch<GitHubRefResponse>(
    `/repos/${repo}/git/ref/heads/${branch}`
  )

  if (!data?.object?.sha) {
    throw new Error(`Could not resolve latest commit for ${branch}`)
  }

  return data.object.sha
}

async function getRepoFile(path: string) {
  const { repo } = getConfig()
  const headSha = await getBranchHeadSha()
  const data = await githubFetch<GitHubContentResponse>(
    `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(headSha)}`
  )

  if (!data) {
    return null
  }

  const content = JSON.parse(
    Buffer.from(data.content, 'base64').toString('utf8')
  )
  return { content, sha: data.sha }
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

export async function saveShowsFile(
  shows: unknown[],
  sha: string,
  message = 'chore: 🧹 update shows from admin CMS'
) {
  const { repo, branch } = getConfig()
  const content = JSON.stringify({ shows }, null, 2) + '\n'

  return githubFetch(`/repos/${repo}/contents/shows.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      sha,
      branch,
    }),
  })
}

export async function saveShowsFileRetrying(
  shows: unknown[],
  message = 'chore: 🧹 update shows from admin CMS'
) {
  let { sha } = await getShowsFile()
  let lastError: unknown

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await saveShowsFile(shows, sha, message)
      return
    } catch (error) {
      lastError = error
      if (!isGithubConflictError(error) || attempt === 2) {
        throw error
      }
      sha = (await getShowsFile()).sha
    }
  }

  throw lastError
}

export async function saveStateFile(
  state: unknown,
  sha: string | null,
  message = 'chore: 🧹 update episode progress from admin CMS'
) {
  const { repo, branch } = getConfig()
  const content = JSON.stringify(state, null, 2) + '\n'

  const body: Record<string, string> = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
  }

  if (sha) {
    body.sha = sha
  }

  return githubFetch(`/repos/${repo}/contents/state.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
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

export function slugify(value: string): string {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

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
