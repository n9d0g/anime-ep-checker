import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findRankingChartUrl, parseRssItems } from './site-feed.ts'
import {
  REDDIT_USER_FEEDS,
  matchesRedditFeedTitle,
} from '../shared/reddit-feeds.ts'
import { buildRankingDiscussionSearchUrl } from '../shared/reddit.ts'

// Trimmed from https://animecorner.me/feed/ (2026-11-20).
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Anime Corner - RSS Feed</title>
  <item>
    <title>Fall 2026 Anime Rankings &#8211; Week 7</title>
    <link>https://animecorner.me/fall-2026-anime-rankings-week-7/</link>
    <pubDate>Fri, 20 Nov 2026 12:30:00 GMT</pubDate>
    <category><![CDATA[Rankings]]></category>
    <guid>https://animecorner.me/fall-2026-anime-rankings-week-7/</guid>
  </item>
  <item>
    <title><![CDATA[Spice and Wolf Season 2 Announces January 2027 Premiere]]></title>
    <link>https://animecorner.me/spice-and-wolf-season-2/</link>
    <pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate>
    <guid isPermaLink="false">https://animecorner.me/?p=123</guid>
  </item>
  <item><title>No link</title></item>
</channel></rss>`

test('parseRssItems reads RSS 2.0 items in feed order', () => {
  assert.deepEqual(parseRssItems(XML), [
    {
      id: 'https://animecorner.me/fall-2026-anime-rankings-week-7/',
      title: 'Fall 2026 Anime Rankings – Week 7',
      href: 'https://animecorner.me/fall-2026-anime-rankings-week-7/',
      published: '2026-11-20T12:30:00.000Z',
      subreddit: null,
    },
    {
      id: 'https://animecorner.me/?p=123',
      title: 'Spice and Wolf Season 2 Announces January 2027 Premiere',
      href: 'https://animecorner.me/spice-and-wolf-season-2/',
      published: '2026-11-20T10:00:00.000Z',
      subreddit: null,
    },
  ])
})

test('Anime Corner feed only matches ranking posts', () => {
  const feed = REDDIT_USER_FEEDS.find((f) => f.id === 'animecorner-site')
  assert.ok(feed)
  assert.equal(
    matchesRedditFeedTitle(feed, 'Fall 2026 Anime Rankings – Week 7'),
    true
  )
  assert.equal(
    matchesRedditFeedTitle(
      feed,
      'Spice and Wolf Season 2 Announces January 2027 Premiere'
    ),
    false
  )
})

// Trimmed from https://animecorner.me/fall-2026-anime-rankings-week-8/ (2026-11-27).
const ARTICLE = `<header><img class="logo" src="https://static.animecorner.me/logo.png"></header>
<div class="entry-content">
<figure><img fetchpriority="high" decoding="async" width="1200" height="1800" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E" alt="" class="wp-image-221461 penci-lazy" data-src="https://static.animecorner.me/2026/11/1795781288-762f9b85d85dde8b663acf7b494708a7.png" data-srcset="https://static.animecorner.me/2026/11/1795781288-762f9b85d85dde8b663acf7b494708a7-200x300.png 200w"></figure>
<img class="wp-image-221470" src="https://static.animecorner.me/2026/11/second.jpg">
</div>`

test('findRankingChartUrl takes the first content image, lazy-loaded', () => {
  assert.equal(
    findRankingChartUrl(ARTICLE),
    'https://static.animecorner.me/2026/11/1795781288-762f9b85d85dde8b663acf7b494708a7.png'
  )
})

test('findRankingChartUrl reads src when the image is not lazy-loaded', () => {
  assert.equal(
    findRankingChartUrl(
      '<img src="https://example.com/chart.png" class="aligncenter wp-image-5">'
    ),
    'https://example.com/chart.png'
  )
})

test('findRankingChartUrl returns null without a content image', () => {
  assert.equal(
    findRankingChartUrl('<img class="logo" src="https://example.com/a.png">'),
    null
  )
  assert.equal(
    findRankingChartUrl(
      '<img class="wp-image-1" src="data:image/gif;base64,">'
    ),
    null
  )
})

test('ranking discussion search names the source and season', () => {
  assert.equal(
    buildRankingDiscussionSearchUrl(
      'Anime Corner',
      'Fall 2026 Anime Rankings – Week 8'
    ),
    'https://www.reddit.com/r/anime/search/?q=Anime+Corner+Fall+2026&restrict_sr=on&sort=new'
  )
  assert.equal(
    buildRankingDiscussionSearchUrl('Anime Corner', 'Weekly rankings'),
    'https://www.reddit.com/r/anime/search/?q=Anime+Corner&restrict_sr=on&sort=new'
  )
})
