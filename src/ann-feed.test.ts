import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAnnFeed } from './ann-feed.ts'

const FEED = `<?xml version="1.0"?><rss><channel>
<item>
  <title>Frieren Anime&#039;s Episode 9 Delayed by 1 Week</title>
  <link>https://www.animenewsnetwork.com/news/2026-10-28/frieren-delayed/.1</link>
  <pubDate>Wed, 28 Oct 2026 16:30:00 -0400</pubDate>
</item>
<item>
  <title>Frieren Episode Review</title>
  <link>https://www.animenewsnetwork.com/review/2026-10-28/frieren/.2</link>
  <pubDate>Wed, 28 Oct 2026 16:30:00 -0400</pubDate>
</item>
<item>
  <title>Old &amp; Stale</title>
  <link>https://www.animenewsnetwork.com/news/2026-10-01/old/.3</link>
  <pubDate>Thu, 01 Oct 2026 10:00:00 -0400</pubDate>
</item>
</channel></rss>`

test('the ANN feed keeps news from the last 7 days', () => {
  assert.deepEqual(parseAnnFeed(FEED, new Date('2026-10-30T17:00:00.000Z')), [
    {
      title: "Frieren Anime's Episode 9 Delayed by 1 Week",
      url: 'https://www.animenewsnetwork.com/news/2026-10-28/frieren-delayed/.1',
      publishedAt: '2026-10-28T20:30:00.000Z',
    },
  ])
})
