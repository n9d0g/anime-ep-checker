import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { exchangeMalCode, getMalRedirectUri } from '@/lib/mal'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return new NextResponse(`MAL authorization failed: ${error}`, { status: 400 })
  }

  if (!code || !state) {
    return new NextResponse('Missing MAL authorization code.', { status: 400 })
  }

  const cookieStore = await cookies()
  const expectedState = cookieStore.get('mal_oauth_state')?.value
  const codeVerifier = cookieStore.get('mal_code_verifier')?.value

  if (!expectedState || state !== expectedState || !codeVerifier) {
    return new NextResponse('Invalid or expired MAL OAuth state.', { status: 400 })
  }

  cookieStore.delete('mal_oauth_state')
  cookieStore.delete('mal_code_verifier')

  try {
    const redirectUri = getMalRedirectUri(request.url)
    const tokens = await exchangeMalCode(code, codeVerifier, redirectUri)
    const refreshToken = tokens.refresh_token

    if (!refreshToken) {
      return new NextResponse('MAL did not return a refresh token.', {
        status: 500,
      })
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>MAL connected</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    code, pre { background: #111; color: #f5f5f5; padding: 0.75rem; border-radius: 8px; display: block; overflow-x: auto; }
    a { color: #6ea8fe; }
  </style>
</head>
<body>
  <h1>MyAnimeList connected</h1>
  <p>Copy this refresh token into your Vercel project as <code>MAL_REFRESH_TOKEN</code>, then redeploy.</p>
  <pre>${refreshToken}</pre>
  <p><a href="/mal">Back to MAL setup</a> · <a href="/">Admin home</a></p>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new NextResponse(message, { status: 500 })
  }
}
