/**
 * Release notes: what's New and what's Fixed in each Release, read from the
 * GitHub Releases the deploy creates (ADR 0004). The build bakes them into the
 * app (scripts/release-notes.ts), so the Releases page makes no request.
 */

export interface Release {
  /** e.g. "0.2.0", without the "v". */
  version: string
  /** When it went live, as an ISO timestamp, or "" if unknown. */
  date: string
  new: string[]
  fixed: string[]
}

/** A GitHub Release as the build reads it. */
export interface GitHubRelease {
  tag_name: string
  published_at: string | null
  body: string | null
}

type Kind = 'new' | 'fixed'
const KINDS: Record<string, Kind> = { feat: 'new', fix: 'fixed' }

/**
 * What a Release's notes say: the deploy writes one `- feat: ✨ …` line per
 * squashed PR. Only feat and fix count; the type, gitmoji and PR number go.
 */
export function notesFrom(body: string): Pick<Release, 'new' | 'fixed'> {
  const notes: Record<Kind, string[]> = { new: [], fixed: [] }
  for (const raw of body.split(/\r?\n/)) {
    const item = /^\s*[-*]\s+(.*)$/.exec(raw)?.[1]
    const commit = item && /^(\w+)(?:\([^)]*\))?!?:\s*(.*)$/.exec(item)
    const kind = commit && KINDS[commit[1]!]
    if (!kind) continue
    const text = tidy(commit[2]!)
    if (text !== '') notes[kind].push(text)
  }
  return notes
}

/** Drops a leading gitmoji (✨ or :sparkles:) and "(#86)", and starts with a capital. */
function tidy(text: string): string {
  const plain = text
    .replace(/^(?::[a-z0-9_+-]+:|[\p{Extended_Pictographic}️‍⃣])+\s*/u, '')
    .replace(/\s*\(#\d+\)/g, '')
    .trim()
  return plain.charAt(0).toUpperCase() + plain.slice(1)
}

/**
 * The Releases to show, newest first: those with something New or Fixed.
 * `pending` is the Release the deploy is building, which GitHub doesn't have
 * yet; a re-run's is already there and isn't listed twice.
 */
export function releasesFrom(
  github: GitHubRelease[],
  pending?: GitHubRelease
): Release[] {
  const all = [...github]
  if (pending && !all.some((r) => r.tag_name === pending.tag_name)) {
    all.push(pending)
  }
  return all
    .flatMap((r) => {
      const version = /^v?(\d+\.\d+\.\d+)$/.exec(r.tag_name)?.[1]
      if (!version) return []
      const notes = notesFrom(r.body ?? '')
      if (notes.new.length + notes.fixed.length === 0) return []
      return [{ version, date: r.published_at ?? '', ...notes }]
    })
    .sort((a, b) => compareVersions(b.version, a.version))
}

function compareVersions(a: string, b: string): number {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! - y[i]!
  return 0
}
