import { NextResponse } from 'next/server'
import {
  ephemeralResponse,
  parseMalCustomId,
  verifyDiscordRequest,
} from '@/lib/discord'
import { updateMalWatchedEpisode } from '@/lib/mal'

interface DiscordInteraction {
  type: number
  data?: {
    custom_id?: string
  }
}

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim()
  if (!publicKey) {
    return new NextResponse('DISCORD_PUBLIC_KEY is not configured.', {
      status: 500,
    })
  }

  const signature = request.headers.get('x-signature-ed25519')
  const timestamp = request.headers.get('x-signature-timestamp')
  const body = await request.text()

  if (!verifyDiscordRequest(body, signature, timestamp, publicKey)) {
    return new NextResponse('Invalid request signature', { status: 401 })
  }

  const interaction = JSON.parse(body) as DiscordInteraction

  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 })
  }

  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id ?? ''
    const parsed = parseMalCustomId(customId)

    if (!parsed) {
      return NextResponse.json(
        ephemeralResponse('Unknown button action.')
      )
    }

    try {
      const result = await updateMalWatchedEpisode(
        parsed.malId,
        parsed.episodeNumber
      )

      if (!result.updated) {
        return NextResponse.json(
          ephemeralResponse(
            `MAL already at episode ${result.watched} (requested ${parsed.episodeNumber}).`
          )
        )
      }

      return NextResponse.json(
        ephemeralResponse(
          `Updated MAL to episode ${parsed.episodeNumber}.`
        )
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update MAL.'
      return NextResponse.json(ephemeralResponse(message))
    }
  }

  return NextResponse.json(ephemeralResponse('Unsupported interaction.'))
}
