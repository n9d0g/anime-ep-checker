export const DISCORD_API = 'https://discord.com/api/v10'

export class DiscordApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'DiscordApiError'
    this.status = status
  }
}

export async function discordBotRequest(
  botToken: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bot ${botToken}`)

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers,
  })
}

export async function createBotMessage(
  botToken: string,
  channelId: string,
  payload: Record<string, unknown>
): Promise<{ id: string }> {
  const response = await discordBotRequest(
    botToken,
    `/channels/${channelId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Discord bot message failed (${response.status}): ${body}`)
  }

  return response.json() as Promise<{ id: string }>
}

export async function editBotMessage(
  botToken: string,
  channelId: string,
  messageId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const response = await discordBotRequest(
    botToken,
    `/channels/${channelId}/messages/${messageId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new DiscordApiError(
      response.status,
      `Discord bot message edit failed (${response.status}): ${body}`
    )
  }
}

export async function deleteBotMessage(
  botToken: string,
  channelId: string,
  messageId: string
): Promise<void> {
  const response = await discordBotRequest(
    botToken,
    `/channels/${channelId}/messages/${messageId}`,
    { method: 'DELETE' }
  )

  if (!response.ok && response.status !== 404) {
    const body = await response.text()
    console.warn(`Discord message delete failed (${response.status}): ${body}`)
  }
}

const CHANNEL_PINNED_MESSAGE = 6

interface DiscordChannelMessage {
  id: string
  type: number
  message_reference?: { message_id?: string }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function listChannelMessages(
  botToken: string,
  channelId: string,
  limit = 15
): Promise<DiscordChannelMessage[]> {
  const response = await discordBotRequest(
    botToken,
    `/channels/${channelId}/messages?limit=${limit}`
  )

  if (!response.ok) {
    const body = await response.text()
    console.warn(
      `Discord channel messages fetch failed (${response.status}): ${body}`
    )
    return []
  }

  return response.json() as Promise<DiscordChannelMessage[]>
}

export function shouldRecreateWatchingMessageOnEditFailure(
  error: unknown
): boolean {
  if (!(error instanceof DiscordApiError)) {
    return false
  }

  if (error.status === 404) {
    return true
  }

  if (error.status === 400) {
    const detail = error.message.toLowerCase()
    return (
      detail.includes('is_components_v2') ||
      detail.includes('components_v2') ||
      detail.includes('cannot be sent with') ||
      detail.includes('cannot contain') ||
      (detail.includes('content') && detail.includes('embed'))
    )
  }

  return false
}

export async function deletePinnedSystemMessage(
  botToken: string,
  channelId: string,
  pinnedMessageId: string
): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const messages = await listChannelMessages(botToken, channelId)
    const systemMessage = messages.find(
      (message) =>
        message.type === CHANNEL_PINNED_MESSAGE &&
        message.message_reference?.message_id === pinnedMessageId
    )

    if (systemMessage) {
      await deleteBotMessage(botToken, channelId, systemMessage.id)
      return
    }

    if (attempt < 2) {
      await sleep(500)
    }
  }

  console.warn(
    `  Could not find pin system message for watching card ${pinnedMessageId}`
  )
}

export async function pinBotMessage(
  botToken: string,
  channelId: string,
  messageId: string
): Promise<void> {
  const response = await discordBotRequest(
    botToken,
    `/channels/${channelId}/pins/${messageId}`,
    { method: 'PUT' }
  )

  if (!response.ok) {
    const body = await response.text()
    console.warn(`Discord pin failed (${response.status}): ${body}`)
    return
  }

  await deletePinnedSystemMessage(botToken, channelId, messageId)
}
