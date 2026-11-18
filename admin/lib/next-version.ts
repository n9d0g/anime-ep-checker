/**
 * The version a push to main releases (ADR 0004). The deploy runs it through
 * scripts/next-version.ts with the push's commit messages: a squash merge's
 * is the PR title, then its body.
 */

export type Bump = 'major' | 'minor' | 'patch'

const PATCH_TYPES = new Set(['fix', 'perf', 'refactor', 'build'])
const ORDER: Bump[] = ['patch', 'minor', 'major']

/** What one conventional commit asks for, or null (chore, ci, docs, style, test, …). */
export function bumpFor(message: string): Bump | null {
  const [subject = ''] = message.split('\n')
  const head = /^(\w+)(?:\([^)]*\))?(!)?:/.exec(subject)
  if (!head) return null
  if (head[2] || /^BREAKING[ -]CHANGE:/m.test(message)) return 'major'
  if (head[1] === 'feat') return 'minor'
  return PATCH_TYPES.has(head[1]!) ? 'patch' : null
}

/**
 * The version after `current` for these commits, or null when they release
 * nothing. The biggest bump wins; below 1.0.0 a breaking change is a minor.
 */
export function nextVersion(
  current: string,
  messages: string[]
): string | null {
  const bumps = messages.map(bumpFor).filter((bump) => bump !== null)
  if (bumps.length === 0) return null
  let bump = ORDER[Math.max(...bumps.map((b) => ORDER.indexOf(b)))]!
  const [major = 0, minor = 0, patch = 0] = current.split('.').map(Number)
  if (bump === 'major' && major === 0) bump = 'minor'
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}
