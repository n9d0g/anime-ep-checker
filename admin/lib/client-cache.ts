const BOOTSTRAP_CACHE_KEY = 'aec-admin-bootstrap-v1'
const PTW_CACHE_KEY = 'aec-admin-ptw-v1'
const ON_HOLD_CACHE_KEY = 'aec-admin-on-hold-v1'

export function readJsonCache<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeJsonCache<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore quota errors.
  }
}

export const cacheKeys = {
  bootstrap: BOOTSTRAP_CACHE_KEY,
  ptw: PTW_CACHE_KEY,
  onHold: ON_HOLD_CACHE_KEY,
}
