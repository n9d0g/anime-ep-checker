// A show's official news page as plain text, one line per block, for the
// announced-break keyword matcher.
// Japanese sites still in Shift_JIS or EUC-JP are decoded by their charset.
const FETCH_TIMEOUT_MS = 15_000
/** Plenty for a news list's recent notices. */
const MAX_TEXT_LENGTH = 20000

function getCharset(contentType: string | null, head: string): string {
  const fromHeader = contentType?.match(/charset=["']?([\w-]+)/i)?.[1]
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]
  return (fromHeader || fromMeta || 'utf-8').toLowerCase()
}

function decodeBody(bytes: ArrayBuffer, contentType: string | null): string {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 2048))
  try {
    return new TextDecoder(getCharset(contentType, head)).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/**
 * The page's visible text: no scripts, styles or tags, one line per block
 * (so one notice's words stay together), spaces collapsed.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<\/?(br|p|div|li|ul|ol|dl|dt|dd|tr|h[1-6]|section|article|header|footer|time)\b[^>]*>/gi,
      '\n'
    )
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim()
    .slice(0, MAX_TEXT_LENGTH)
}

/**
 * The official page's text, or null when it can't be fetched or has no text
 * (e.g. a page rendered by JavaScript). Failures are logged, not thrown.
 */
export async function fetchOfficialNewsText(
  url: string
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'anime-ep-checker (+https://github.com/n9d0g/anime-ep-checker)',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.warn(`  Official news page failed (${response.status}): ${url}`)
      return null
    }
    const text = htmlToText(
      decodeBody(
        await response.arrayBuffer(),
        response.headers.get('content-type')
      )
    )
    return text || null
  } catch (error) {
    console.warn(
      `  Official news page failed: ${
        error instanceof Error ? error.message : error
      }`
    )
    return null
  }
}
