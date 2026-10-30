import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AnnNewsItem } from './ann-feed.ts'
import { findAnnBreak, findOfficialBreak } from './break-keywords.ts'

/** Episode 6 broadcasts Thursday 2026-11-05 25:00 JST (Fri 01:00 = Thu 16:00 UTC). */
const EP6 = { episode: 6, broadcastAt: new Date('2026-11-05T16:00:00.000Z') }

test('a notice naming the episode is a break, TBA without a later date', () => {
  const page = [
    'NEWS',
    '2026.11.02',
    '第6話 放送延期のお知らせ',
    '2026.10.20',
    'Blu-ray第1巻 発売決定！',
  ].join('\n')
  assert.deepEqual(findOfficialBreak(page, EP6), { episode: 6, newDate: null })
  // Full-width digits and kanji numerals too.
  assert.deepEqual(findOfficialBreak('第６話の放送を休止いたします。', EP6), {
    episode: 6,
    newDate: null,
  })
  assert.deepEqual(findOfficialBreak('第六話は総集編を放送します', EP6), {
    episode: 6,
    newDate: null,
  })
})

test('a notice naming the skipped broadcast date gives the resume date', () => {
  // Late-night slot: listed as Thursday 25:00, i.e. Nov 5.
  const page =
    '11月5日（木）25:00の放送はお休みとなります。第6話は11月12日（木）より放送いたします。'
  assert.deepEqual(findOfficialBreak(page, EP6), {
    episode: 6,
    newDate: '2026-11-12',
  })
  // The same notice dated by the Friday (JST) also counts.
  assert.deepEqual(findOfficialBreak('11/6 放送休止、11/13 再開予定', EP6), {
    episode: 6,
    newDate: '2026-11-13',
  })
})

test('old notices, other episodes and unrelated news are not breaks', () => {
  assert.equal(findOfficialBreak('第4話 放送延期のお知らせ', EP6), null)
  assert.equal(findOfficialBreak('第6話 あらすじ・場面カット公開！', EP6), null)
  // The break word and the episode are in different notices (lines).
  assert.equal(
    findOfficialBreak('放送休止のお知らせ\n第6話 あらすじ公開', EP6),
    null
  )
})

const titles = [
  'Kusuriya no Hitorigoto 3rd Season',
  'The Apothecary Diaries Season 3',
]
const item = (title: string, publishedAt = '2026-11-01T12:00:00.000Z') => ({
  title,
  url: `https://www.animenewsnetwork.com/news/${encodeURIComponent(title)}`,
  publishedAt,
})
const annBreak = (items: AnnNewsItem[]) =>
  findAnnBreak(items, {
    titles,
    episode: 6,
    since: new Date('2026-10-30T15:50:00.000Z'),
  })

test('an ANN headline with a title, a break word and an anime word counts', () => {
  const headline = item(
    "Apothecary Diaries Anime's 3rd Season Delays Episode 6"
  )
  assert.equal(annBreak([headline]), headline)
  const romaji = item('Kusuriya no Hitorigoto TV Anime Postponed by 1 Week')
  assert.equal(annBreak([romaji]), romaji)
})

test('manga news, other episodes and headlines before the last drop do not count', () => {
  assert.equal(
    annBreak([item('The Apothecary Diaries Manga Goes on Hiatus')]),
    null
  )
  assert.equal(
    annBreak([item('Apothecary Diaries Anime Delays Episode 5')]),
    null
  )
  assert.equal(
    annBreak([
      item(
        'Apothecary Diaries Anime Delays Episode 6',
        '2026-10-29T12:00:00.000Z'
      ),
    ]),
    null
  )
  assert.equal(annBreak([item('Frieren Anime Delays Episode 6')]), null)
})
