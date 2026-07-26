export const IS_COMPONENTS_V2 = 1 << 15
export const MAL_PROGRESS_MARKER = '**MAL progress:**'

export function formatMalProgressLine(label: string): string {
  return `${MAL_PROGRESS_MARKER} ${label}`
}

export function patchMalProgressInComponents(
  components: unknown[],
  watchedLabel: string
): unknown[] | null {
  let patched = false

  function walk(items: unknown[]): unknown[] {
    return items.map((item) => {
      if (!item || typeof item !== 'object') {
        return item
      }

      const component = item as Record<string, unknown>

      if (component.type === 10 && typeof component.content === 'string') {
        if (component.content.includes(MAL_PROGRESS_MARKER)) {
          patched = true
          return {
            ...component,
            content: formatMalProgressLine(watchedLabel),
          }
        }
        return component
      }

      if (Array.isArray(component.components)) {
        return {
          ...component,
          components: walk(component.components),
        }
      }

      return component
    })
  }

  const next = walk(components)
  return patched ? next : null
}
