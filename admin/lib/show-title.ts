export function shouldShowEnglishSubtitle(
  title: string,
  titleEnglish?: string | null
): boolean {
  const english = titleEnglish?.trim()
  if (!english) {
    return false
  }
  return english.toLowerCase() !== title.trim().toLowerCase()
}
