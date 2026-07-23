export const DISCORD_API = 'https://discord.com/api/v10'

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
    throw new Error(`Discord bot message edit failed (${response.status}): ${body}`)
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
  }
}
