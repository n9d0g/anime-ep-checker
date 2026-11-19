import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function MalSetupPage() {
  const hasClientId = Boolean(process.env.MAL_CLIENT_ID)

  return (
    <main className="page-column">
      <header>
        <div>
          <h1>MyAnimeList setup</h1>
          <p className="mt-[0.35rem] text-[0.88rem] text-(--text-secondary)">
            Connect your MAL account so the admin CMS can sync list progress and
            show MAL data on shows in Watching.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Back</Link>
        </Button>
      </header>

      <Card asChild className="grid gap-[0.85rem]">
        <section>
          <ol className="grid list-decimal gap-2 pl-[1.2rem] text-[0.88rem] text-(--text-secondary) [&_code]:font-[monospace] [&_code]:text-[0.85em] [&_code]:text-foreground">
            <li>
              Create a MAL API client at{' '}
              <a
                href="https://myanimelist.net/apiconfig"
                target="_blank"
                rel="noreferrer"
              >
                myanimelist.net/apiconfig
              </a>
              .
            </li>
            <li>
              Set redirect URI to your admin callback, e.g.{' '}
              <code>https://anime-ep-checker.dev/api/mal/callback</code>
            </li>
            <li>
              Add <code>MAL_CLIENT_ID</code>, <code>MAL_CLIENT_SECRET</code>,
              and <code>MAL_REDIRECT_URI</code> as Cloudflare Worker secrets (
              <code>wrangler secret put</code>).
            </li>
            <li>
              Click connect below, then paste the refresh token into{' '}
              <code>MAL_REFRESH_TOKEN</code> on Cloudflare.
            </li>
          </ol>

          {hasClientId ? (
            <Button asChild>
              <a href="/api/mal/auth">Connect MyAnimeList</a>
            </Button>
          ) : (
            <p className="min-h-5 text-[0.8rem] text-destructive">
              MAL_CLIENT_ID is not set on this deployment yet.
            </p>
          )}
        </section>
      </Card>
    </main>
  )
}
