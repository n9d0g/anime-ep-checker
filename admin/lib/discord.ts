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

export function ephemeralResponse(content: string) {
  return {
    type: 4,
    data: {
      content,
      flags: 64,
    },
  }
}
