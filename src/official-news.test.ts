import assert from 'node:assert/strict'
import { test } from 'node:test'
import { htmlToText } from './official-news.ts'

test('official pages are reduced to their visible text', () => {
  const html = `<html><head><style>.a{}</style><script>var x = 1</script></head>
<body><!-- nav --><ul><li>2026.10.28 <a href="/news/9">第9話 放送延期のお知らせ</a></li>
<li>Q&amp;A&nbsp;more</li></ul></body></html>`
  assert.equal(htmlToText(html), '2026.10.28 第9話 放送延期のお知らせ Q&A more')
})
