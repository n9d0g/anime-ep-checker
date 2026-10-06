import Link from 'next/link'

export default function MalSetupPage() {
  const hasClientId = Boolean(process.env.MAL_CLIENT_ID)

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1>MyAnimeList setup</h1>
          <p className="subtitle">
            Connect your MAL account so the admin CMS can sync list progress and
            show MAL data on tracked shows.
          </p>
        </div>
        <Link className="btn btn-secondary" href="/">
          Back
        </Link>
      </header>

      <section className="panel stack">
        <ol className="setup-steps">
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
            Add <code>MAL_CLIENT_ID</code>, <code>MAL_CLIENT_SECRET</code>, and{' '}
            <code>MAL_REDIRECT_URI</code> as Cloudflare Worker secrets (
            <code>wrangler secret put</code>).
          </li>
          <li>
            Click connect below, then paste the refresh token into{' '}
            <code>MAL_REFRESH_TOKEN</code> on Cloudflare.
          </li>
        </ol>

        {hasClientId ? (
          <a className="btn" href="/api/mal/auth">
            Connect MyAnimeList
          </a>
        ) : (
          <p className="status error">
            MAL_CLIENT_ID is not set on this deployment yet.
          </p>
        )}
      </section>
    </main>
  )
}
