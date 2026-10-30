// Keyword matching for announced breaks (GitHub Models, the earlier reader,
// was retired). Every match is only an alert plus a suggestion the user
// confirms or dismisses, so the rules favour finding a real break over
// never being wrong.
import type { AnnNewsItem } from './ann-feed.ts'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/** A break of `episode` found in the news, with its new date if given. */
export interface BreakMatch {
  episode: number
  /** The new Japanese broadcast date (YYYY-MM-DD), or null while TBA. */
  newDate: string | null
}

const OFFICIAL_BREAK_WORDS =
  /延期|放送休止|休止|振替|特別編|総集編|お休み|postpone|delay|hiatus/i

const ANN_BREAK_WORDS =
  /\b(delay(s|ed)?|postpone(s|d)?|hiatus|break|suspend(s|ed)?)\b/i
/** Keeps a manga or novel hiatus of the same title from counting. */
const ANN_ANIME_WORDS = /\b(anime|episodes?|broadcast|airing|tv)\b/i

const KANJI_DIGITS = '〇一二三四五六七八九'

/** 6 → 六, 12 → 十二, 21 → 二十一. */
function toKanjiNumber(n: number): string {
  if (n < 10) return KANJI_DIGITS[n]!
  const tens = Math.floor(n / 10)
  const ones = n % 10
  return `${tens > 1 ? KANJI_DIGITS[tens] : ''}十${ones ? KANJI_DIGITS[ones] : ''}`
}

/** Full-width digits, letters and symbols as ASCII (１１月 → 11月, ＃ → #). */
function normalizeWidth(text: string): string {
  return text.normalize('NFKC')
}

function mentionsEpisode(text: string, episode: number): boolean {
  return new RegExp(
    `第\\s*(${episode}|${toKanjiNumber(episode)})\\s*話|#\\s*0?${episode}(?!\\d)|\\b(episode|ep\\.?)\\s*${episode}(?!\\d)`,
    'i'
  ).test(text)
}

/** The Japanese calendar date of an instant: month and day. */
function japanMonthDay(date: Date): { month: number; day: number } {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS)
  return { month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() }
}

/** The Japanese calendar date of an instant, as UTC midnight milliseconds. */
function japanDayMs(date: Date): number {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS)
  return Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate()
  )
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

interface DateMention {
  month: number
  day: number
  index: number
}

/** "11月13日", "11/13" and "November 13" in the text, in order. */
function findDates(text: string): DateMention[] {
  const dates: DateMention[] = []
  const patterns: [RegExp, (m: RegExpMatchArray) => [number, number]][] = [
    [/(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, (m) => [Number(m[1]), Number(m[2])]],
    [
      /(?<![\d/.])(\d{1,2})\/(\d{1,2})(?![\d/])/g,
      (m) => [Number(m[1]), Number(m[2])],
    ],
    [
      new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})\\b`, 'gi'),
      (m) => [MONTHS.indexOf(m[1]!.toLowerCase()) + 1, Number(m[2])],
    ],
  ]
  for (const [pattern, read] of patterns) {
    for (const match of text.matchAll(pattern)) {
      const [month, day] = read(match)
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        dates.push({ month, day, index: match.index! })
      }
    }
  }
  return dates.sort((a, b) => a.index - b.index)
}

/** The month/day's date in the year that puts it nearest after `from`. */
function toIsoDateAfter(month: number, day: number, from: Date): string {
  const fromDay = japanDayMs(from)
  let year = new Date(fromDay).getUTCFullYear()
  if (Date.UTC(year, month - 1, day) < fromDay - 180 * MS_PER_DAY) {
    year += 1
  }
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

/**
 * Each sentence with the rest of its line: a match must sit in one sentence,
 * but a notice often gives the new date in the sentence after.
 */
function splitSentences(text: string): { sentence: string; rest: string }[] {
  return text.split('\n').flatMap((line) => {
    const sentences = line.split(/(?<=[。！？!?])/)
    return sentences.map((sentence, index) => ({
      sentence,
      rest: sentences.slice(index).join(''),
    }))
  })
}

/**
 * A break of the next episode in the official page's text: a break word in
 * the same line or sentence as the episode's number or its expected
 * broadcast date (late-night broadcasts are often dated the day before).
 */
export function findOfficialBreak(
  text: string,
  {
    episode,
    broadcastAt,
  }: {
    episode: number
    /** When the episode is expected to broadcast (or drop) in Japan. */
    broadcastAt: Date
  }
): BreakMatch | null {
  const expectedDays = [
    japanMonthDay(broadcastAt),
    japanMonthDay(new Date(broadcastAt.getTime() - 6 * 60 * 60 * 1000)),
  ]
  const expectedDayMs = japanDayMs(broadcastAt)

  for (const { sentence, rest } of splitSentences(normalizeWidth(text))) {
    const breakWord = OFFICIAL_BREAK_WORDS.exec(sentence)
    if (!breakWord) continue

    const dates = findDates(sentence)
    const namesDate = dates.some((date) =>
      expectedDays.some(
        (expected) => expected.month === date.month && expected.day === date.day
      )
    )
    if (!namesDate && !mentionsEpisode(sentence, episode)) continue

    const newDate = findDates(rest)
      .filter((date) => date.index > breakWord.index)
      .map((date) => toIsoDateAfter(date.month, date.day, broadcastAt))
      .find((date) => Date.parse(`${date}T00:00:00Z`) > expectedDayMs)
    return { episode, newDate: newDate ?? null }
  }
  return null
}

/** Lower case, letters and digits only, season words and a leading article dropped. */
function normalizeTitle(text: string): string {
  return ` ${text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(
      /\b(season|part|cour)\s*\d+\b|\b\d+(st|nd|rd|th)\s+(season|part|cour)\b|\bfinal\s+season\b/g,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')} `
}

/**
 * An ANN headline announcing a break of the show's next episode: a break
 * word, an anime context word and one of the show's titles, published after
 * the last drop. A headline naming another episode doesn't count.
 */
export function findAnnBreak(
  items: AnnNewsItem[],
  {
    titles,
    episode,
    since,
  }: {
    titles: string[]
    episode: number
    /** The last drop: older headlines are about an earlier episode. */
    since: Date | null
  }
): AnnNewsItem | null {
  const normalizedTitles = titles
    .map(normalizeTitle)
    .filter((title) => title.trim().length >= 4)

  return (
    items.find((item) => {
      if (since && Date.parse(item.publishedAt) <= since.getTime()) {
        return false
      }
      if (!ANN_BREAK_WORDS.test(item.title)) return false
      if (!ANN_ANIME_WORDS.test(item.title)) return false
      const headline = normalizeTitle(item.title)
      if (!normalizedTitles.some((title) => headline.includes(title))) {
        return false
      }
      const namedEpisode = item.title.match(/\bepisode\s*(\d+)\b/i)
      return !namedEpisode || Number(namedEpisode[1]) === episode
    }) ?? null
  )
}
