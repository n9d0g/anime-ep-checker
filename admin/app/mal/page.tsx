import Link from 'next/link'

export default function MalSetupPage() {
  const hasClientId = Boolean(process.env.MAL_CLIENT_ID)

  return (
    <main className="container">
      <header className="header">
        <div>
          <h1>MyAnimeList setup</h1>
          <p className="subtitle">
            Connect your MAL account so Discord &quot;Mark watched on MAL&quot;
            buttons can update your list.
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
            <code>https://your-admin.vercel.app/api/mal/callback</code>
          </li>
          <li>
            Add <code>MAL_CLIENT_ID</code>, <code>MAL_CLIENT_SECRET</code>, and{' '}
            <code>MAL_REDIRECT_URI</code> to Vercel.
          </li>
          <li>
            Register your Discord interactions URL in the Discord Developer
            Portal:{' '}
            <code>https://your-admin.vercel.app/api/discord/interactions</code>
          </li>
          <li>
            Click connect below, then paste the refresh token into{' '}
            <code>MAL_REFRESH_TOKEN</code> on Vercel.
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
