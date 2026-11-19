import Link from 'next/link'
import releases from 'virtual:release-notes'
import type { Release } from '@/lib/release-notes'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

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
    <main className="page-column">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1>Release notes</h1>
          <p className="mt-[0.35rem] text-[0.88rem] text-(--text-secondary)">
            Running v{RUNNING}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Back</Link>
        </Button>
      </header>

      {releases.length === 0 ? (
        <p className="mt-[0.35rem] text-[0.88rem] text-(--text-secondary)">
          No release notes yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
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
    <Card asChild>
      <section aria-labelledby={headingId}>
        <div className="flex items-center gap-[0.6rem]">
          <h2 id={headingId} className="text-[1.05rem] tabular-nums">
            v{release.version}
          </h2>
          {release.version === RUNNING ? (
            <Badge variant="accent">This version</Badge>
          ) : null}
        </div>
        {release.date ? (
          <p className="mt-1 text-[0.8rem] text-(--text-secondary)">
            {releaseDate.format(new Date(release.date))}
          </p>
        ) : null}
        <Notes title="New" items={release.new} />
        <Notes title="Fixed" items={release.fixed} />
      </section>
    </Card>
  )
}

function Notes({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-[0.85rem]">
      <h3 className="text-[0.82rem] font-bold text-(--text-secondary)">
        {title}
      </h3>
      <ul className="mt-[0.35rem] list-[circle] pl-[1.2rem] text-[0.9rem] leading-[1.45]">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
