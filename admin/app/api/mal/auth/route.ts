import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getMalRedirectUri } from '@/lib/mal'

export async function GET(request: Request) {
  const clientId = process.env.MAL_CLIENT_ID?.trim()
  if (!clientId) {
    return NextResponse.json(
      { error: 'MAL_CLIENT_ID is not configured on Vercel.' },
      { status: 500 }
    )
  }

  const state = crypto.randomUUID()
  const codeVerifier = crypto.randomUUID()
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
