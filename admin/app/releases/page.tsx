import Link from 'next/link'
import releases from 'virtual:release-notes'
import type { Release } from '@/lib/release-notes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

/** The version running here, without dev's "-dev". */
const RUNNING = __APP_VERSION__.replace(/-dev$/, '')

const releaseDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

/**
 * Release notes, from the account menu: what's New and Fixed in each Release,
 * newest first. They're the ones baked into the code running here
 * (vite.config.ts), so an older Home Screen app sees the Releases up to its own.
 */
export default function ReleasesPage() {
  return (
    <main className="container">
      <header className="header releases-header">
        <div>
          <h1>Release notes</h1>
          <p className="subtitle">Running v{RUNNING}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Back</Link>
        </Button>
      </header>

      {releases.length === 0 ? (
        <p className="subtitle">No release notes yet.</p>
      ) : (
        <ol className="release-list">
          {releases.map((release) => (
            <li key={release.version}>
              <ReleaseCard release={release} />
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}

function ReleaseCard({ release }: { release: Release }) {
  const headingId = `release-${release.version}`
  return (
    <section className="panel release-card" aria-labelledby={headingId}>
      <div className="release-card-heading">
        <h2 id={headingId}>v{release.version}</h2>
        {release.version === RUNNING ? (
          <Badge variant="accent">This version</Badge>
        ) : null}
      </div>
      {release.date ? (
        <p className="release-date">
          {releaseDate.format(new Date(release.date))}
        </p>
      ) : null}
      <Notes title="New" items={release.new} />
      <Notes title="Fixed" items={release.fixed} />
    </section>
  )
}

function Notes({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="release-notes">
      <h3>{title}</h3>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
