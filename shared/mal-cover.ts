export interface MalMainPicture {
  medium?: string
  large?: string
}

/** MAL's large cover image when there is one, else the medium one. */
export function pickMalCoverUrl(
  picture: MalMainPicture | undefined
): string | null {
  return picture?.large ?? picture?.medium ?? null
}
