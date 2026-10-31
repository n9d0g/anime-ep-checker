// Keyword matching for return announcements: news that a show awaiting
// return is coming back. A franchise's news is mostly films, merch and
// events, so a match needs a return word and an anime word, and anything
// naming another medium is left out.
import type { AnnNewsItem } from './ann-feed.ts'
import { MONTHS, normalizeTitle } from './break-keywords.ts'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** When the news says the show returns, as precisely as it says it. */
export interface ReturnReading {
  /** The Japanese broadcast date (YYYY-MM-DD), when the news gives a day. */
  returnsOn: string | null
  /** A month or season ("July 2027", "Summer 2027") without a day. */
  returnsIn: string | null
  episode: number | null
}

const RETURN_WORDS =
  /(放送|配信)(を|が)?再開|再開決定|再始動|帰ってくる|\b(returns?|returning|resumes?|resumed|resuming|resumption|restarts?|comes? back|coming back|back on air)\b/i

const ANIME_WORDS =
  /テレビアニメ|TVアニメ|アニメ|放送|\b(anime|tv|episodes?|broadcast|airing)\b/i

/** Other media and franchise news that shares the show's name. */
const OTHER_MEDIA_WORDS =
  /劇場版|映画|実写|Netflix|ゲーム|舞台|ミュージカル|グッズ|ショップ|コラボ|クルーズ|イベント|\b(film|movie|live[- ]action|netflix|game|stage|musical|manga|cruise|collab|collaboration|event)\b/i

const SEASONS: Record<string, string> = {
  春: 'Spring',
  夏: 'Summer',
  秋: 'Fall',
  冬: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  autumn: 'Fall',
  winter: 'Winter',
}

const MONTH_LABELS = MONTHS.map(
  (month) => month[0]!.toUpperCase() + month.slice(1)
)
const MONTH_PATTERN = MONTHS.join('|')

/** Today in Japan, as UTC midnight milliseconds. */
function japanTodayMs(now: Date): number {
  const shifted = new Date(now.getTime() + JST_OFFSET_MS)
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  )
}

/** The year a month falls in: the stated one, else the next one from today. */
function resolveYear(
  year: string | undefined,
  month: number,
  todayMs: number
): number {
  if (year) return Number(year)
  const today = new Date(todayMs)
  const thisYear = today.getUTCFullYear()
  return month < today.getUTCMonth() + 1 ? thisYear + 1 : thisYear
}

function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

/** The most precise future return time in the text, or null for TBA. */
function readReturnTime(
  text: string,
  now: Date
): Pick<ReturnReading, 'returnsOn' | 'returnsIn'> {
  const todayMs = japanTodayMs(now)
  const exactPatterns: [RegExp, (m: RegExpMatchArray) => string[]][] = [
    [
      /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
      (m) => [m[1]!, m[2]!, m[3]!],
    ],
    [
      new RegExp(
        `\\b(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`,
        'i'
      ),
      (m) => [m[3]!, String(MONTHS.indexOf(m[1]!.toLowerCase()) + 1), m[2]!],
    ],
  ]
  for (const [pattern, read] of exactPatterns) {
    const match = text.match(pattern)
    if (!match) continue
    const [year, month, day] = read(match)
    const resolvedYear = resolveYear(year, Number(month), todayMs)
    const date = isoDate(resolvedYear, Number(month), Number(day))
    if (Date.parse(`${date}T00:00:00Z`) >= todayMs) {
      return { returnsOn: date, returnsIn: null }
    }
  }

  const monthPatterns: [RegExp, (m: RegExpMatchArray) => string[]][] = [
    [/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月(?!\s*\d)/, (m) => [m[1]!, m[2]!]],
    // "in July", "July 2027": a bare month name could be the word "may".
    [
      new RegExp(
        `\\b(?:(?:in|from|this|starting)\\s+(${MONTH_PATTERN})(?!\\s+\\d{1,2}\\b)(?:\\s+(\\d{4}))?|(${MONTH_PATTERN})\\s+(\\d{4}))\\b`,
        'i'
      ),
      (m) => [
        m[2] ?? m[4]!,
        String(MONTHS.indexOf((m[1] ?? m[3]!).toLowerCase()) + 1),
      ],
    ],
  ]
  for (const [pattern, read] of monthPatterns) {
    const match = text.match(pattern)
    if (!match) continue
    const [year, month] = read(match)
    const resolvedYear = resolveYear(year, Number(month), todayMs)
    const monthEnd = Date.UTC(resolvedYear, Number(month), 1) - MS_PER_DAY
    if (monthEnd >= todayMs) {
      return {
        returnsOn: null,
        returnsIn: `${MONTH_LABELS[Number(month) - 1]} ${resolvedYear}`,
      }
    }
  }

  const season =
    text.match(/(\d{4})\s*年\s*(春|夏|秋|冬)/) ??
    text.match(/\b(spring|summer|fall|autumn|winter)\s+(\d{4})\b/i)
  if (season) {
    const [year, name] = /^\d/.test(season[1]!)
      ? [season[1]!, season[2]!]
      : [season[2]!, season[1]!]
    if (Number(year) >= new Date(todayMs).getUTCFullYear()) {
      return {
        returnsOn: null,
        returnsIn: `${SEASONS[name.toLowerCase()]} ${year}`,
      }
    }
  }

  return { returnsOn: null, returnsIn: null }
}

function readEpisode(text: string): number | null {
  const match = text.match(/第\s*(\d+)\s*話|\bepisode\s*(\d+)\b/i)
  return match ? Number(match[1] ?? match[2]) : null
}

function readReturn(text: string, now: Date): ReturnReading {
  return { ...readReturnTime(text, now), episode: readEpisode(text) }
}

/**
 * A return notice on the show's official news page, newest first: a return
 * word in the headline, an anime word in it or the category lines just
 * after it, and no other medium named.
 */
export function findOfficialReturn(
  text: string,
  now: Date
): ReturnReading | null {
  const lines = text.normalize('NFKC').split('\n')
  for (const [index, line] of lines.entries()) {
    if (!RETURN_WORDS.test(line) || OTHER_MEDIA_WORDS.test(line)) continue
    const context = lines.slice(index, index + 3).join('\n')
    if (!ANIME_WORDS.test(context)) continue
    return readReturn(line, now)
  }
  return null
}

/**
 * An ANN headline announcing the show's return: one of its titles, a return
 * word and an anime word, and no other medium named.
 */
export function findAnnReturn(
  items: AnnNewsItem[],
  { titles, now }: { titles: string[]; now: Date }
): { item: AnnNewsItem; reading: ReturnReading } | null {
  const normalizedTitles = titles
    .map(normalizeTitle)
    .filter((title) => title.trim().length >= 4)

  for (const item of items) {
    const headline = item.title.normalize('NFKC')
    if (!RETURN_WORDS.test(headline)) continue
    if (!ANIME_WORDS.test(headline)) continue
    if (OTHER_MEDIA_WORDS.test(headline)) continue
    const normalized = normalizeTitle(headline)
    if (!normalizedTitles.some((title) => normalized.includes(title))) {
      continue
    }
    return { item, reading: readReturn(headline, now) }
  }
  return null
}
