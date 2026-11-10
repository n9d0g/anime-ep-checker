import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  base64UrlDecode,
  base64UrlEncode,
  concatBytes,
  encryptPushPayload,
  hkdf,
  isPushSubscriptionJson,
  sendPush,
  vapidAuthorization,
  type VapidKeys,
} from './web-push'

const encoder = new TextEncoder()

async function newUserAgent() {
  const keys = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )) as CryptoKeyPair
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', keys.publicKey)
  )
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return {
    keys,
    publicKey,
    auth,
    subscription: {
      endpoint: 'https://web.push.apple.com/QGuQyavXutnMH',
      keys: { p256dh: base64UrlEncode(publicKey), auth: base64UrlEncode(auth) },
    },
  }
}

async function newVapidKeys(): Promise<VapidKeys> {
  const keys = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', keys.privateKey)
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey('raw', keys.publicKey)
  )
  return {
    publicKey: base64UrlEncode(publicKey),
    privateKey: jwk.d!,
    subject: 'https://anime-ep-checker.dev',
  }
}

// The receiving side of RFC 8291, written out separately from the sender.
async function decrypt(
  body: Uint8Array,
  ua: Awaited<ReturnType<typeof newUserAgent>>
): Promise<string> {
  const salt = body.slice(0, 16)
  const recordSize = new DataView(
    body.buffer,
    body.byteOffset + 16,
    4
  ).getUint32(0)
  assert.equal(recordSize, 4096)
  const keyLength = body[20]
  const asPublic = body.slice(21, 21 + keyLength)
  const ciphertext = body.slice(21 + keyLength)

  const asKey = await crypto.subtle.importKey(
    'raw',
    asPublic,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: asKey },
      ua.keys.privateKey,
      256
    )
  )
  const ikm = await hkdf(
    ua.auth,
    ecdhSecret,
    concatBytes(encoder.encode('WebPush: info\0'), ua.publicKey, asPublic),
    32
  )
  const cek = await hkdf(
    salt,
    ikm,
    encoder.encode('Content-Encoding: aes128gcm\0'),
    16
  )
  const nonce = await hkdf(
    salt,
    ikm,
    encoder.encode('Content-Encoding: nonce\0'),
    12
  )
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, [
    'decrypt',
  ])
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext)
  )
  assert.equal(plaintext.at(-1), 0x02, 'last record delimiter')
  return new TextDecoder().decode(plaintext.slice(0, -1))
}

test('base64url round-trips without padding', () => {
  const bytes = new Uint8Array([251, 255, 0, 62, 63])
  const encoded = base64UrlEncode(bytes)
  assert.doesNotMatch(encoded, /[+/=]/)
  assert.deepEqual(base64UrlDecode(encoded), bytes)
})

test('a push body decrypts on the subscribing device', async () => {
  const ua = await newUserAgent()
  const payload = JSON.stringify({
    web_push: 8030,
    notification: { title: 'Frieren' },
  })
  const body = await encryptPushPayload(ua.subscription, payload)
  assert.equal(await decrypt(body, ua), payload)
})

test('each push body uses a fresh salt and server key', async () => {
  const ua = await newUserAgent()
  const first = await encryptPushPayload(ua.subscription, 'same')
  const second = await encryptPushPayload(ua.subscription, 'same')
  assert.notDeepEqual(first.slice(0, 86), second.slice(0, 86))
})

test('the VAPID header carries a JWT the public key verifies', async () => {
  const vapid = await newVapidKeys()
  const now = new Date('2026-11-09T12:00:00Z')
  const header = await vapidAuthorization(
    'https://web.push.apple.com/QGuQyavXutnMH',
    vapid,
    now
  )
  const match = /^vapid t=([^,]+), k=(.+)$/.exec(header)
  assert.ok(match)
  assert.equal(match[2], vapid.publicKey)

  const [encodedHeader, encodedClaims, signature] = match[1].split('.')
  const claims = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(encodedClaims))
  )
  assert.deepEqual(claims, {
    aud: 'https://web.push.apple.com',
    exp: now.getTime() / 1000 + 12 * 60 * 60,
    sub: 'https://anime-ep-checker.dev',
  })

  const publicKey = await crypto.subtle.importKey(
    'raw',
    base64UrlDecode(vapid.publicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  )
  assert.equal(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      base64UrlDecode(signature),
      encoder.encode(`${encodedHeader}.${encodedClaims}`)
    ),
    true
  )
})

test('404 and 410 mean the subscription is gone; other errors are failures', async () => {
  const ua = await newUserAgent()
  const vapid = await newVapidKeys()
  const respond = (status: number) =>
    (async () => new Response('nope', { status })) as typeof fetch

  assert.deepEqual(await sendPush(ua.subscription, 'x', vapid, respond(201)), {
    status: 'sent',
  })
  assert.deepEqual(await sendPush(ua.subscription, 'x', vapid, respond(404)), {
    status: 'gone',
  })
  assert.deepEqual(await sendPush(ua.subscription, 'x', vapid, respond(410)), {
    status: 'gone',
  })
  assert.deepEqual(await sendPush(ua.subscription, 'x', vapid, respond(429)), {
    status: 'failed',
    httpStatus: 429,
    detail: 'nope',
  })
})

test('the push request is aes128gcm with VAPID auth', async () => {
  const ua = await newUserAgent()
  const vapid = await newVapidKeys()
  let seen: RequestInit | undefined
  await sendPush(ua.subscription, 'x', vapid, (async (
    _url: string,
    init: RequestInit
  ) => {
    seen = init
    return new Response(null, { status: 201 })
  }) as typeof fetch)

  const headers = seen!.headers as Record<string, string>
  assert.equal(seen!.method, 'POST')
  assert.equal(headers['Content-Encoding'], 'aes128gcm')
  assert.match(headers.Authorization, /^vapid t=.+, k=/)
  assert.ok(Number(headers.TTL) > 0)
})

test('only https subscriptions with keys are accepted', () => {
  const keys = { p256dh: 'a', auth: 'b' }
  assert.equal(
    isPushSubscriptionJson({ endpoint: 'https://web.push.apple.com/x', keys }),
    true
  )
  assert.equal(
    isPushSubscriptionJson({ endpoint: 'http://web.push.apple.com/x', keys }),
    false
  )
  assert.equal(isPushSubscriptionJson({ endpoint: 'not a url', keys }), false)
  assert.equal(
    isPushSubscriptionJson({ endpoint: 'https://x.test/', keys: {} }),
    false
  )
  assert.equal(isPushSubscriptionJson(null), false)
})
