interface PremiereSortKey {
  /**
   * The last day the premiere date could mean: the day itself, the end of
   * its month, or the end of its year, so vague dates land after every more
   * precise date in their span.
   */
  end: number
  /** 0 for a day, 1 for a month, 2 for a year: breaks ties at `end`. */
  vagueness: number
}

/** Null when the premiere date can't be read. */
function premiereSortKey(premiereDate: string): PremiereSortKey | null {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(premiereDate.trim())
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const end = match[3]
    ? new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[3])))
    : match[2]
      ? new Date(Date.UTC(year, Number(match[2]), 0))
      : new Date(Date.UTC(year, 11, 31))
  if (Number.isNaN(end.getTime())) {
    return null
  }
  return { end: end.getTime(), vagueness: match[3] ? 0 : match[2] ? 1 : 2 }
}

function compareTitles(a: { title: string }, b: { title: string }): number {
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
}

/**
 * Upcoming shows by premiere date, soonest first, with vague dates at the end
 * of their month or year. Shows with no premiere date still ahead of `today`
 * go last, by title.
 */
export function sortByPremiereDate<
  T extends { title: string; startDate: string | null },
>(entries: T[], today: Date): T[] {
  const dated: { entry: T; key: PremiereSortKey }[] = []
  const undated: T[] = []

  for (const entry of entries) {
    const key = entry.startDate ? premiereSortKey(entry.startDate) : null
    if (key && key.end >= today.getTime()) {
      dated.push({ entry, key })
    } else {
      undated.push(entry)
    }
  }

  dated.sort(
    (a, b) =>
      a.key.end - b.key.end ||
      a.key.vagueness - b.key.vagueness ||
      compareTitles(a.entry, b.entry)
  )
  undated.sort(compareTitles)

  return [...dated.map(({ entry }) => entry), ...undated]
}
