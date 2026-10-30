import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { fetchAniListMedia } from './anilist'

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
})

function media(idMal: number, banner: string | null = `https://img/${idMal}`) {
  return {
    idMal,
    bannerImage: banner,
    coverImage: { large: `https://cover/${idMal}` },
    studios: {
      edges: [
        { isMain: true, node: { name: 'MADHOUSE' } },
        { isMain: false, node: { name: 'Aniplex' } },
        { isMain: false, node: { name: 'Dentsu' } },
      ],
    },
  }
}

/** Answers each AniList request from `respond`, recording the IDs asked for. */
function fakeAniList(
  respond: (ids: number[], call: number) => Response
): number[][] {
  const calls: number[][] = []
  globalThis.fetch = async (_input, init) => {
    const { variables } = JSON.parse(String(init?.body)) as {
      variables: { ids: number[] }
    }
    calls.push(variables.ids)
    return respond(variables.ids, calls.length)
  }
  return calls
}

const page = (ids: number[]) =>
  Response.json({ data: { Page: { media: ids.map((id) => media(id)) } } })

test('asks for 50 shows per request and maps banners, covers and producers', async () => {
  const ids = Array.from({ length: 120 }, (_, index) => index + 1)
  const calls = fakeAniList((batch) => page(batch))

  const result = await fetchAniListMedia(ids)

  assert.deepEqual(
    calls.map((batch) => batch.length),
    [50, 50, 20]
  )
  assert.equal(result.answered.length, 120)
  assert.deepEqual(result.media[7], {
    bannerUrl: 'https://img/7',
    coverUrl: 'https://cover/7',
    producers: ['Aniplex', 'Dentsu'],
  })
})

test('drops duplicate and invalid IDs before asking', async () => {
  const calls = fakeAniList((batch) => page(batch))
  await fetchAniListMedia([5, 5, 0, -1, 6])
  assert.deepEqual(calls, [[5, 6]])
})

test('waits out a rate limit and retries', async () => {
  const calls = fakeAniList((batch, call) =>
    call === 1
      ? new Response('', { status: 429, headers: { 'Retry-After': '0' } })
      : page(batch)
  )
  const result = await fetchAniListMedia([1, 2])
  assert.equal(calls.length, 2)
  assert.deepEqual(Object.keys(result.media), ['1', '2'])
})

test('a failing batch is skipped and not counted as answered', async () => {
  const ids = Array.from({ length: 60 }, (_, index) => index + 1)
  fakeAniList((batch, call) =>
    call === 1 ? new Response('', { status: 500 }) : page(batch)
  )
  const result = await fetchAniListMedia(ids)
  assert.equal(result.media[1], undefined)
  assert.ok(result.media[51])
  // Only the batch that came back counts as answered, so the rest is retried.
  assert.deepEqual(result.answered, ids.slice(50))
})
