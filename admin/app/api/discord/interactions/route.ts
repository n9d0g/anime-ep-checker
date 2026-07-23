import { NextResponse } from 'next/server'
import {
  ephemeralResponse,
  parseMalAdjustCustomId,
  parseMalCustomId,
  updateMessageResponse,
  verifyDiscordRequest,
} from '@/lib/discord'
import {
  adjustMalWatchedEpisode,
  formatMalWatchedLabel,
  updateMalWatchedEpisode,
} from '@/lib/mal'

interface DiscordEmbedField {
  name: string
  value: string
  inline?: boolean
}

interface DiscordEmbed {
  title?: string
  url?: string
  color?: number
  fields?: DiscordEmbedField[]
  footer?: { text: string }
}

interface DiscordInteraction {
  type: number
  data?: {
    custom_id?: string
  }
  message?: {
    embeds?: DiscordEmbed[]
    components?: unknown[]
  }
}

function refreshMalFieldInMessage(
  message: DiscordInteraction['message'],
  watched: number,
  total: number | null
): { embeds: DiscordEmbed[]; components: unknown[] } | null {
  const embed = message?.embeds?.[0]
  if (!embed?.fields) {
    return null
  }

  const malLabel = formatMalWatchedLabel(watched, total)
  const embeds = [
    {
      ...embed,
      fields: embed.fields.map((field) =>
        field.name === 'MAL' ? { ...field, value: malLabel } : field
      ),
    },
  ]

  return {
    embeds,
    components: message?.components ?? [],
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
    const adjustAction = parseMalAdjustCustomId(customId)

    if (adjustAction) {
      try {
        const result = await adjustMalWatchedEpisode(
          adjustAction.malId,
          adjustAction.delta
        )

        const refreshed = refreshMalFieldInMessage(
          interaction.message,
          result.watched,
          result.total
        )

        if (refreshed) {
          return NextResponse.json(updateMessageResponse(refreshed))
        }

        if (!result.updated) {
          return NextResponse.json(
            ephemeralResponse(
              `MAL already at ${formatMalWatchedLabel(result.watched, result.total)}.`
            )
          )
        }

        return NextResponse.json(
          ephemeralResponse(
            `Updated MAL to ${formatMalWatchedLabel(result.watched, result.total)}.`
          )
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update MAL.'
        return NextResponse.json(ephemeralResponse(message))
      }
    }

    const parsed = parseMalCustomId(customId)

    if (!parsed) {
      return NextResponse.json(ephemeralResponse('Unknown button action.'))
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
        ephemeralResponse(`Updated MAL to episode ${parsed.episodeNumber}.`)
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update MAL.'
      return NextResponse.json(ephemeralResponse(message))
    }
  }

  return NextResponse.json(ephemeralResponse('Unsupported interaction.'))
}
