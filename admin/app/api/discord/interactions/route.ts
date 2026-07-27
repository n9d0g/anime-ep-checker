import { after, NextResponse } from 'next/server'
import {
  buildMalSetProgressModal,
  deferredEphemeralResponse,
  editOriginalInteractionResponse,
  ephemeralResponse,
  parseMalAdjustCustomId,
  parseMalCustomId,
  parseMalSetButtonCustomId,
  parseMalSetModalCustomId,
  updateMessageResponse,
  verifyDiscordRequest,
} from '@/lib/discord'
import {
  adjustMalWatchedEpisode,
  formatMalWatchedLabel,
  setMalWatchedEpisode,
  updateMalWatchedEpisode,
} from '@/lib/mal'
import {
  handleSlashAutocomplete,
  handleSlashCommand,
} from '@/lib/slash'

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

interface DiscordComponent {
  type: number
  custom_id?: string
  value?: string
  components?: DiscordComponent[]
}

interface DiscordInteraction {
  type: number
  application_id?: string
  token?: string
  data?: {
    custom_id?: string
    name?: string
    options?: Array<{
      name: string
      type: number
      value?: string | number
      options?: Array<{ name: string; type: number; value?: string | number }>
    }>
    components?: DiscordComponent[]
  }
  message?: {
    embeds?: DiscordEmbed[]
    components?: unknown[]
  }
}

function fieldValue(embed: DiscordEmbed, name: string): string {
  return embed.fields?.find((field) => field.name === name)?.value ?? '—'
}

function buildWatchingNotificationContent(
  title: string,
  malLabel: string,
  embed: DiscordEmbed
): string {
  const next = fieldValue(embed, 'Next')
  const status = fieldValue(embed, 'Status')
  return `**${title}** — MAL ${malLabel} · Next ${next} · ${status}`
}

function refreshMalFieldsInMessage(
  message: DiscordInteraction['message'],
  watched: number,
  total: number | null
): { content?: string; embeds?: DiscordEmbed[]; components: unknown[] } | null {
  const malLabel = formatMalWatchedLabel(watched, total)
  const embed = message?.embeds?.[0]

  if (!embed?.fields) {
    return null
  }

  const embeds = [
    {
      ...embed,
      fields: embed.fields.map((field) =>
        field.name === 'MAL' ? { ...field, value: malLabel } : field
      ),
    },
  ]

  const title = embed.title ?? 'Watching'
  const content = buildWatchingNotificationContent(title, malLabel, embed)

  return {
    content,
    embeds,
    components: message?.components ?? [],
  }
}

function getModalEpisodeValue(interaction: DiscordInteraction): number | null {
  const row = interaction.data?.components?.[0]
  const input = row?.components?.[0]
  const value = input?.value?.trim()
  if (!value) return null

  const episode = Number(value)
  return Number.isFinite(episode) && episode >= 0 ? episode : null
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

  if (interaction.type === 4) {
    const commandName = interaction.data?.name ?? ''
    const options = interaction.data?.options ?? []
    const focused =
      options.find((option) => (option as { focused?: boolean }).focused) ??
      options[0]

    try {
      const response = await handleSlashAutocomplete(commandName, {
        name: focused?.name ?? 'title',
        value: String(focused?.value ?? ''),
      })
      return NextResponse.json(response)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Autocomplete failed.'
      return NextResponse.json(ephemeralResponse(message))
    }
  }

  if (interaction.type === 2) {
    const commandName = interaction.data?.name ?? ''
    const options = interaction.data?.options ?? []
    const applicationId = interaction.application_id
    const token = interaction.token

    if (!applicationId || !token) {
      return NextResponse.json(
        ephemeralResponse('Missing interaction application_id or token.')
      )
    }

    after(async () => {
      try {
        const payload = await handleSlashCommand(commandName, options)
        await editOriginalInteractionResponse(applicationId, token, payload)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Command failed.'
        await editOriginalInteractionResponse(applicationId, token, {
          content: message,
        })
      }
    })

    return NextResponse.json(deferredEphemeralResponse())
  }

  if (interaction.type === 5) {
    const malId = parseMalSetModalCustomId(interaction.data?.custom_id ?? '')
    const episode = getModalEpisodeValue(interaction)

    if (!malId || episode === null) {
      return NextResponse.json(ephemeralResponse('Invalid episode number.'))
    }

    try {
      const result = await setMalWatchedEpisode(malId, episode)
      const refreshed = refreshMalFieldsInMessage(
        interaction.message,
        result.watched,
        result.total
      )

      if (refreshed) {
        return NextResponse.json(updateMessageResponse(refreshed))
      }

      return NextResponse.json(
        ephemeralResponse(
          result.updated
            ? `Updated MAL to ${formatMalWatchedLabel(result.watched, result.total)}.`
            : `MAL already at ${formatMalWatchedLabel(result.watched, result.total)}.`
        )
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update MAL.'
      return NextResponse.json(ephemeralResponse(message))
    }
  }

  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id ?? ''
    const setButtonMalId = parseMalSetButtonCustomId(customId)

    if (setButtonMalId) {
      return NextResponse.json(buildMalSetProgressModal(setButtonMalId))
    }

    const adjustAction = parseMalAdjustCustomId(customId)

    if (adjustAction) {
      try {
        const result = await adjustMalWatchedEpisode(
          adjustAction.malId,
          adjustAction.delta
        )

        const refreshed = refreshMalFieldsInMessage(
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
