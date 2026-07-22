import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getMalRedirectUri } from '@/lib/mal'

/** MAL PKCE requires code_challenge length 43–128 (UUID is only 36). */
function createCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(64))
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export async function GET(request: Request) {
  const clientId = process.env.MAL_CLIENT_ID?.trim()
  if (!clientId) {
    return NextResponse.json(
      { error: 'MAL_CLIENT_ID is not configured on Vercel.' },
      { status: 500 }
    )
  }

  const state = crypto.randomUUID()
  const codeVerifier = createCodeVerifier()
  const redirectUri = getMalRedirectUri(request.url)

  const cookieStore = await cookies()
  cookieStore.set('mal_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  })
  cookieStore.set('mal_code_verifier', codeVerifier, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 10,
    path: '/',
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    state,
    redirect_uri: redirectUri,
    code_challenge: codeVerifier,
    code_challenge_method: 'plain',
  })

  return NextResponse.redirect(
    `https://myanimelist.net/v1/oauth2/authorize?${params.toString()}`
  )
}
