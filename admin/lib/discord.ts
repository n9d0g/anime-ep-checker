import nacl from 'tweetnacl'

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

export function verifyDiscordRequest(
  body: string,
  signature: string | null,
  timestamp: string | null,
  publicKey: string
): boolean {
  if (!signature || !timestamp || !publicKey) {
    return false
  }

  try {
    return nacl.sign.detached.verify(
      Buffer.from(timestamp + body),
      hexToUint8Array(signature),
      hexToUint8Array(publicKey)
    )
  } catch {
    return false
  }
}

export function parseMalCustomId(customId: string): {
  malId: number
  episodeNumber: number
} | null {
  const match = customId.match(/^mal:(\d+):(\d+)$/)
  if (!match) return null

  const malId = Number(match[1])
  const episodeNumber = Number(match[2])
  if (!Number.isFinite(malId) || !Number.isFinite(episodeNumber)) {
    return null
  }

  return { malId, episodeNumber }
}

export function parseMalAdjustCustomId(customId: string): {
  malId: number
  delta: number
} | null {
  const increment = customId.match(/^mal:inc:(\d+)$/)
  if (increment) {
    const malId = Number(increment[1])
    return Number.isFinite(malId) ? { malId, delta: 1 } : null
  }

  const decrement = customId.match(/^mal:dec:(\d+)$/)
  if (decrement) {
    const malId = Number(decrement[1])
    return Number.isFinite(malId) ? { malId, delta: -1 } : null
  }

  return null
}

export function parseMalSetButtonCustomId(customId: string): number | null {
  const match = customId.match(/^mal:set-btn:(\d+)$/)
  if (!match) return null
  const malId = Number(match[1])
  return Number.isFinite(malId) ? malId : null
}

export function parseMalSetModalCustomId(customId: string): number | null {
  const match = customId.match(/^mal:set:(\d+)$/)
  if (!match) return null
  const malId = Number(match[1])
  return Number.isFinite(malId) ? malId : null
}

export function buildMalSetProgressModal(malId: number) {
  return {
    type: 9,
    data: {
      custom_id: `mal:set:${malId}`,
      title: 'Set MAL progress',
      components: [
        {
          type: 1,
          components: [
            {
              type: 4,
              custom_id: 'episode',
              label: 'Episode number',
              style: 1,
              required: true,
              min_length: 1,
              max_length: 4,
              placeholder: '12',
            },
          ],
        },
      ],
    },
  }
}

export function ephemeralResponse(content: string) {
  return {
    type: 4,
    data: {
      content,
      flags: 64,
    },
  }
}

export function deferredEphemeralResponse() {
  return {
    type: 5,
    data: {
      flags: 64,
    },
  }
}

export async function editOriginalInteractionResponse(
  applicationId: string,
  token: string,
  data: { content?: string; embeds?: unknown[]; flags?: number }
): Promise<void> {
  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  )

  if (!response.ok) {
    const body = await response.text()
    console.error(
      `Discord interaction edit failed (${response.status}): ${body}`
    )
  }
}

export function updateMessageResponse(data: {
  content?: string
  embeds?: unknown[]
  components?: unknown[]
  flags?: number
}) {
  return {
    type: 7,
    data,
  }
}

export async function createBotChannelMessage(
  channelId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim()
  if (!botToken) {
    throw new Error('DISCORD_BOT_TOKEN is not configured on Vercel.')
  }

  const response = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Discord message failed (${response.status}): ${body}`)
  }
}
