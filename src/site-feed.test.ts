import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRssItems } from './site-feed.ts'
import {
  REDDIT_USER_FEEDS,
  matchesRedditFeedTitle,
} from '../shared/reddit-feeds.ts'

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
