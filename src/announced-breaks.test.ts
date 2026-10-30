import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AnnNewsItem } from './ann-feed.ts'
import {
  applyBreakReading,
  parseBreakReading,
  syncAnnouncedBreaks,
} from './announced-breaks.ts'
import type { ChatMessage, ModelsReply } from './github-models.ts'
import type { Show, ShowState, StateFile } from '../shared/types.ts'

/** Episode 3 drops 2026-09-15T15:00Z; a day before, its check is due. */
const SHOW: Show = {
  id: 'frieren',
  title: 'Sousou no Frieren',
  titleEnglish: "Frieren: Beyond Journey's End",
  provider: 'crunchyroll',
  schedule: {
    mode: 'ongoing',
    startAt: '2026-09-01T15:00:00.000Z',
    startEpisode: 1,
    episodeCount: null,
    premiereBatchSize: 1,
  },
}
const NOW = new Date('2026-09-14T15:00:00.000Z')
const SITE = 'https://frieren-anime.jp/'
const ANN: AnnNewsItem = {
  title: 'Frieren Anime Delays Episode 3 by 1 Week',
  url: 'https://www.animenewsnetwork.com/news/2026-09-13/frieren/.1',
  publishedAt: '2026-09-13T12:00:00.000Z',
}
const DISCORD = { webhookUrl: 'https://discord.test/webhook' }

function makeState(extra: Partial<ShowState> = {}): StateFile {
  return {
    shows: {
      frieren: {
        lastEpisodeId: 'ep-2',
        lastEpisodeNumber: '2',
        lastEpisodeTitle: '',
        lastNotifiedAt: '',
        seasonId: '',
        seasonTitle: '',
        officialSiteUrl: SITE,
        ...extra,
      },
    },
  }
}

/** Runs a sync with stubbed sources, model and Discord; records the calls. */
async function run(
  state: StateFile,
  reply: ModelsReply | null,
  { token = 'token', now = NOW }: { token?: string; now?: Date } = {}
) {
  const prompts: ChatMessage[][] = []
  const posts: string[] = []
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    posts.push(JSON.parse(String(init?.body)).content ?? '')
    return new Response(null, { status: 204 })
  }) as typeof fetch
  const result = await syncAnnouncedBreaks({
    shows: [SHOW],
    state,
    discord: DISCORD,
    now,
    dryRun: false,
    token,
    completeJson: token
      ? async (messages) => {
          prompts.push(messages)
          return reply!
        }
      : undefined,
    fetchNews: async () => [ANN],
    fetchPage: async () => '2026.09.13 第3話 放送延期のお知らせ',
  })
  return { ...result, prompts, posts }
}

const delayed = (newDate: string | null): ModelsReply => ({
  ok: true,
  json: { delayed: true, episode: 3, newDate, sourceUrl: ANN.url },
})

test('an announced break is saved and alerted once per episode and date', async () => {
  const state = makeState()
  const first = await run(state, delayed('2026-09-22'))
  assert.equal(first.prompts.length, 1)
  assert.match(first.prompts[0]![1]!.content, /Next new episode: 3/)
  assert.match(first.prompts[0]![1]!.content, /第3話 放送延期/)
  assert.match(first.prompts[0]![1]!.content, /Delays Episode 3/)
  assert.deepEqual(first.posts, [
    '⏸️ **Sousou no Frieren** — Episode 3 postponed (announced): new broadcast date Tue, Sep 22 (JST).',
  ])
  assert.deepEqual(state.shows.frieren!.announcedBreak, {
    episode: 3,
    newDate: '2026-09-22',
    sourceUrl: ANN.url,
    status: 'pending',
    announcedAt: NOW.toISOString(),
  })
  assert.equal(state.shows.frieren!.announcementCheckedAt, NOW.toISOString())
  assert.equal(state.shows.frieren!.announcementReadAt, NOW.toISOString())

  // The next day's check reads the same news: no second alert.
  const nextDay = new Date('2026-09-15T15:16:00.000Z')
  const again = await run(state, delayed('2026-09-22'), { now: nextDay })
  assert.equal(again.prompts.length, 1)
  assert.deepEqual(again.posts, [])
  assert.equal(
    state.shows.frieren!.announcedBreak!.announcedAt,
    NOW.toISOString()
  )
})

test('a new date alerts again; a TBA after a date and a dismissed pair stay silent', async () => {
  const later = new Date('2026-09-15T15:16:00.000Z')
  const tba = makeState({
    announcedBreak: {
      episode: 3,
      newDate: null,
      sourceUrl: null,
      status: 'pending',
      announcedAt: '2026-09-13T15:00:00.000Z',
    },
  })
  const dated = await run(tba, delayed('2026-09-22'), { now: later })
  assert.equal(dated.posts.length, 1)
  assert.equal(tba.shows.frieren!.announcedBreak!.newDate, '2026-09-22')

  const backToTba = await run(tba, delayed(null), {
    now: new Date('2026-09-15T15:46:00.000Z'),
  })
  assert.deepEqual(backToTba.posts, [])
  assert.equal(tba.shows.frieren!.announcedBreak!.newDate, '2026-09-22')

  const dismissed = makeState({
    announcedBreak: {
      episode: 3,
      newDate: '2026-09-22',
      sourceUrl: ANN.url,
      status: 'dismissed',
      announcedAt: '2026-09-13T15:00:00.000Z',
    },
  })
  const silent = await run(dismissed, delayed('2026-09-22'))
  assert.deepEqual(silent.posts, [])
  assert.equal(dismissed.shows.frieren!.announcedBreak!.status, 'dismissed')
})

test('a refused token alerts once until GitHub Models answers again', async () => {
  const state = makeState()
  const refused: ModelsReply = { ok: false, kind: 'auth', message: 'HTTP 403' }
  const first = await run(state, refused)
  assert.equal(first.posts.length, 1)
  assert.equal(state.meta?.githubModelsAlertSentAt, NOW.toISOString())

  const later = new Date('2026-09-15T15:16:00.000Z')
  assert.equal((await run(state, refused, { now: later })).posts.length, 0)

  const recovered = await run(state, delayed(null), {
    now: new Date('2026-09-15T15:46:00.000Z'),
  })
  assert.equal(state.meta?.githubModelsAlertSentAt, null)
  assert.match(recovered.posts[0]!, /new date TBA/)
})

test('rate limits only warn, and the show waits for its next scheduled check', async () => {
  const state = makeState()
  const limited = await run(state, {
    ok: false,
    kind: 'transient',
    message: 'HTTP 429',
  })
  assert.deepEqual(limited.posts, [])
  assert.equal(state.meta?.githubModelsAlertSentAt, undefined)
  assert.equal(state.shows.frieren!.announcementReadAt, undefined)
  assert.equal(state.shows.frieren!.announcementCheckedAt, NOW.toISOString())
  // Not due again an hour later.
  const soon = await run(state, delayed(null), {
    now: new Date('2026-09-14T16:00:00.000Z'),
  })
  assert.equal(soon.prompts.length, 0)
})

test('without GITHUB_TOKEN the checks are skipped', async () => {
  const state = makeState()
  const skipped = await run(state, null, { token: '' })
  assert.equal(skipped.changed, false)
  assert.equal(state.shows.frieren!.announcementCheckedAt, undefined)
})

test('an announced break is cleared once its episode drops', async () => {
  const state = makeState({
    lastEpisodeNumber: '3',
    announcedBreak: {
      episode: 3,
      newDate: '2026-09-22',
      sourceUrl: null,
      status: 'pending',
      announcedAt: '2026-09-13T15:00:00.000Z',
    },
  })
  const result = await run(state, null, { token: '' })
  assert.equal(state.shows.frieren!.announcedBreak, null)
  assert.deepEqual(result.reasons, ['announced break over Sousou no Frieren'])
})

test('readings ignore aired episodes, bad dates and made-up sources', () => {
  const options = { nextEpisode: 3, knownUrls: new Set([SITE]) }
  assert.equal(parseBreakReading({ delayed: false }, options), null)
  assert.equal(parseBreakReading({ delayed: true, episode: 2 }, options), null)
  assert.deepEqual(
    parseBreakReading(
      {
        delayed: true,
        episode: null,
        newDate: 'next week',
        sourceUrl: 'https://example.com/made-up',
      },
      options
    ),
    { episode: 3, newDate: null, sourceUrl: null }
  )
  assert.deepEqual(applyBreakReading(null, null, NOW), {
    announcedBreak: null,
    alert: false,
  })
})
