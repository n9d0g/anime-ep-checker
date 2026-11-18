// The Release notes the build bakes into the app (vite.config.ts). It reads
// the GitHub Releases with `gh`, which needs a token: the deploy passes its
// own. The deploy also passes the Release it's about to create, which GitHub
// doesn't have yet:
//
//   RELEASE_VERSION=0.2.0 RELEASE_NOTES=$'- feat: …' vinext-cloudflare deploy
//
// Without `gh` or a token (CI, or dev signed out) the app gets no Release
// notes, and the build carries on.

import { execFileSync } from 'node:child_process'
import {
  releasesFrom,
  type GitHubRelease,
  type Release,
} from '../lib/release-notes.ts'

export function loadReleaseNotes(
  env: NodeJS.ProcessEnv = process.env
): Release[] {
  let github: GitHubRelease[]
  try {
    const out = execFileSync(
      'gh',
      [
        'api',
        'repos/{owner}/{repo}/releases?per_page=100',
        '--paginate',
        '--jq',
        '.[] | {tag_name, published_at, body}',
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 30_000,
      }
    )
    github = out
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as GitHubRelease)
  } catch {
    console.warn(
      "Release notes: couldn't read GitHub Releases with gh; the app gets none."
    )
    github = []
  }
  const pending = env.RELEASE_VERSION
    ? {
        tag_name: `v${env.RELEASE_VERSION}`,
        published_at: new Date().toISOString(),
        body: env.RELEASE_NOTES ?? '',
      }
    : undefined
  return releasesFrom(github, pending)
}
