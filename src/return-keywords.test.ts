import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AnnNewsItem } from './ann-feed.ts'
import { findAnnReturn, findOfficialReturn } from './return-keywords.ts'

const NOW = new Date('2026-10-31T12:00:00.000Z')

/** One Piece's official TV anime news, as the page reader returns it. */
const officialPage = (...items: [string, string, string][]) =>
  ['新しい順', ...items.flat(), 'もっと見る'].join('\n')

test('an official return notice gives its exact date and episode', () => {
  const page = officialPage(
    [
      'TVアニメ『ONE PIECE』第1181話より7月5日(日)放送再開決定！',
      '2027/03/01',
      'テレビアニメ',
    ],
    ['アニメ次回予告を更新！第1180話', '2026/09/20', 'テレビアニメ']
  )
  assert.deepEqual(findOfficialReturn(page, NOW), {
    returnsOn: '2027-07-05',
    returnsIn: null,
    episode: 1181,
  })
})

test('an official notice with only a month or a season is a rough return', () => {
  assert.deepEqual(
    findOfficialReturn(
      officialPage([
        'アニメ『ONE PIECE』2027年7月より放送再開',
        '2027/03/01',
        'テレビアニメ',
      ]),
      NOW
    ),
    { returnsOn: null, returnsIn: 'July 2027', episode: null }
  )
  // Full-width digits read the same.
  assert.deepEqual(
    findOfficialReturn(
      officialPage([
        'TVアニメ ２０２７年夏 放送再開！',
        '2026/10/30',
        'テレビアニメ',
      ]),
      NOW
    ),
    { returnsOn: null, returnsIn: 'Summer 2027', episode: null }
  )
  assert.deepEqual(
    findOfficialReturn(
      officialPage([
        'エルバフ編 第2クール 放送再開決定！',
        '2026/10/30',
        'テレビアニメ',
      ]),
      NOW
    ),
    { returnsOn: null, returnsIn: null, episode: null }
  )
})

test('films, collabs, merch and ordinary episode news are not returns', () => {
  const page = officialPage(
    [
      '新作映画公開決定！2027年夏『ONE PIECE FILM GOD VALLEY』が公開!!',
      '2026/08/23',
      '劇場版',
    ],
    [
      '2027年夏に『ONE PIECE』と「飛鳥II」のコラボクルーズが決定',
      '2026/10/23',
      'イベント・施設',
    ],
    ['麦わらストアで限定グッズの受付再開', '2026/10/30', 'グッズ'],
    ['アニメ次回予告を更新！第1180話', '2026/09/20', 'テレビアニメ'],
    ['『THE ONE PIECE』ティザー予告を公開', '2026/06/24', 'テレビアニメ']
  )
  assert.equal(findOfficialReturn(page, NOW), null)
})

test('a date already past is not the return date', () => {
  assert.deepEqual(
    findOfficialReturn(
      officialPage([
        'TVアニメ 2026年4月5日より放送再開',
        '2026/03/01',
        'テレビアニメ',
      ]),
      NOW
    ),
    { returnsOn: null, returnsIn: null, episode: null }
  )
})

const titles = ['One Piece', 'One Piece']
const item = (title: string): AnnNewsItem => ({
  title,
  url: `https://www.animenewsnetwork.com/news/${encodeURIComponent(title)}`,
  publishedAt: '2026-10-30T12:00:00.000Z',
})
const annReturn = (items: AnnNewsItem[]) =>
  findAnnReturn(items, { titles, now: NOW })

test('an ANN headline with the title, a return word and an anime word counts', () => {
  const dated = item(
    'One Piece Anime Returns on July 5, 2027 With Episode 1181'
  )
  assert.deepEqual(annReturn([dated]), {
    item: dated,
    reading: { returnsOn: '2027-07-05', returnsIn: null, episode: 1181 },
  })
  const month = item('One Piece TV Anime Resumes in July 2027')
  assert.deepEqual(annReturn([month])?.reading, {
    returnsOn: null,
    returnsIn: 'July 2027',
    episode: null,
  })
  const season = item("One Piece Anime's Elbaf Arc Returns in Summer 2027")
  assert.deepEqual(annReturn([season])?.reading, {
    returnsOn: null,
    returnsIn: 'Summer 2027',
    episode: null,
  })
})

test('other media, other shows and "may" are not ANN returns or months', () => {
  assert.equal(
    annReturn([
      item("Netflix's Live-Action One Piece Series Returns for Season 3"),
      item('One Piece Film God Valley Anime Film Returns to Theaters'),
      item('One Piece Manga Returns From Break'),
      item('Frieren Anime Returns in January 2027'),
    ]),
    null
  )
  assert.deepEqual(
    annReturn([item('One Piece Anime May Return Sooner Than Expected')])
      ?.reading,
    { returnsOn: null, returnsIn: null, episode: null }
  )
})
