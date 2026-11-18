/** admin/package.json's version, injected at build time by vite.config.ts; "-dev" in dev. */
declare const __APP_VERSION__: string

/** Every Release with Release notes, newest first, baked in at build time by vite.config.ts. */
declare module 'virtual:release-notes' {
  import type { Release } from '@/lib/release-notes'
  const releases: Release[]
  export default releases
}
