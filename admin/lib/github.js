const GITHUB_API = 'https://api.github.com'

function getConfig() {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  const branch = process.env.GITHUB_BRANCH || 'main'

  if (!token || !repo) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPO must be set')
  }

  return { token, repo, branch }
}

async function githubFetch(path, options = {}) {
  const { token } = getConfig()
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub API ${response.status}: ${body}`)
  }

  if (response.status === 204) return null
  return response.json()
}

export async function getShowsFile() {
  const { repo, branch } = getConfig()
  const data = await githubFetch(
    `/repos/${repo}/contents/shows.json?ref=${branch}`
  )
  const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'))
  return { content, sha: data.sha }
}

export async function saveShowsFile(shows, sha, message = 'chore: update shows from admin CMS') {
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

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

export function parseSeriesIdFromUrl(url) {
  const match = String(url).match(/\/series\/([A-Z0-9]+)/i)
  return match ? match[1].toUpperCase() : null
}
