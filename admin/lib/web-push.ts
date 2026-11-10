// Web Push sending with Web Crypto only (it runs on the Worker): VAPID auth
// (RFC 8292) and aes128gcm payload encryption (RFC 8291 / RFC 8188).

export interface PushSubscriptionJson {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface VapidKeys {
  /** Uncompressed P-256 public key, base64url (65 bytes). */
  publicKey: string
  /** P-256 private scalar, base64url (32 bytes). */
  privateKey: string
  /** Contact for push services: a mailto: or https: URL. */
  subject: string
}

type Bytes = Uint8Array<ArrayBuffer>

const RECORD_SIZE = 4096
const VAPID_TTL_SECONDS = 12 * 60 * 60

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlDecode(value: string): Bytes {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function concatBytes(...parts: Uint8Array[]): Bytes {
  const result = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0)
  )
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

const encoder = new TextEncoder()

function utf8(value: string): Bytes {
  return new Uint8Array(encoder.encode(value))
}

/** HKDF-SHA-256 extract and expand in one step. */
export async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Bytes> {
  const key = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(ikm),
    'HKDF',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(salt),
      info: new Uint8Array(info),
    },
    key,
    length * 8
  )
  return new Uint8Array(bits)
}

function p256Jwk(publicKey: Uint8Array, privateKey?: Uint8Array): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error('Expected an uncompressed P-256 public key')
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(publicKey.slice(1, 33)),
    y: base64UrlEncode(publicKey.slice(33, 65)),
    ...(privateKey ? { d: base64UrlEncode(privateKey) } : {}),
    ext: true,
  }
}

/** The `Authorization` header value for one push service origin. */
export async function vapidAuthorization(
  endpoint: string,
  vapid: VapidKeys,
  now: Date = new Date()
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(now.getTime() / 1000) + VAPID_TTL_SECONDS,
    sub: vapid.subject,
  }
  const unsigned = `${base64UrlEncode(utf8(JSON.stringify(header)))}.${base64UrlEncode(
    utf8(JSON.stringify(claims))
  )}`
  const key = await crypto.subtle.importKey(
    'jwk',
    p256Jwk(
      base64UrlDecode(vapid.publicKey),
      base64UrlDecode(vapid.privateKey)
    ),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )
  // Web Crypto's ECDSA signature is already JOSE's raw r || s.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    utf8(unsigned)
  )
  const jwt = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`
  return `vapid t=${jwt}, k=${vapid.publicKey}`
}

/** Encrypts one push message body for a subscription (single aes128gcm record). */
export async function encryptPushPayload(
  subscription: PushSubscriptionJson,
  payload: string,
  // Fixed only by tests.
  random: { salt?: Uint8Array; serverKeys?: CryptoKeyPair } = {}
): Promise<Bytes> {
  const uaPublic = base64UrlDecode(subscription.keys.p256dh)
  const authSecret = base64UrlDecode(subscription.keys.auth)
  const salt = random.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const serverKeys =
    random.serverKeys ??
    ((await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    )) as CryptoKeyPair)
  const asPublic = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeys.publicKey)
  )
  const uaKey = await crypto.subtle.importKey(
    'raw',
    uaPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaKey },
      serverKeys.privateKey,
      256
    )
  )

  const ikm = await hkdf(
    authSecret,
    ecdhSecret,
    concatBytes(utf8('WebPush: info\0'), uaPublic, asPublic),
    32
  )
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, [
    'encrypt',
  ])
  // 0x02 marks the last (and only) record; no padding.
  const plaintext = concatBytes(utf8(payload), new Uint8Array([0x02]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      aesKey,
      plaintext
    )
  )

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE)
  return concatBytes(
    salt,
    recordSize,
    new Uint8Array([asPublic.length]),
    asPublic,
    ciphertext
  )
}

export type PushSendResult =
  | { status: 'sent' }
  /** The push service says this subscription is gone for good. */
  | { status: 'gone' }
  | { status: 'failed'; httpStatus: number; detail: string }

export async function sendPush(
  subscription: PushSubscriptionJson,
  payload: string,
  vapid: VapidKeys,
  fetchImpl: typeof fetch = fetch
): Promise<PushSendResult> {
  const body = await encryptPushPayload(subscription, payload)
  const response = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(24 * 60 * 60),
      Urgency: 'high',
    },
    body,
  })

  if (response.ok) {
    return { status: 'sent' }
  }
  if (response.status === 404 || response.status === 410) {
    return { status: 'gone' }
  }
  return {
    status: 'failed',
    httpStatus: response.status,
    detail: await response.text().catch(() => ''),
  }
}

export function isPushSubscriptionJson(
  value: unknown
): value is PushSubscriptionJson {
  if (!value || typeof value !== 'object') {
    return false
  }
  const { endpoint, keys } = value as Partial<PushSubscriptionJson>
  if (typeof endpoint !== 'string' || !keys || typeof keys !== 'object') {
    return false
  }
  try {
    if (new URL(endpoint).protocol !== 'https:') {
      return false
    }
  } catch {
    return false
  }
  return typeof keys.p256dh === 'string' && typeof keys.auth === 'string'
}
