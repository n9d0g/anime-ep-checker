import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import vinext from 'vinext'
import { cloudflare } from '@cloudflare/vite-plugin'
import { imagesOptimizer } from '@vinext/cloudflare/images/images-optimizer'
import { loadReleaseNotes } from './scripts/release-notes.ts'

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version: string }

export default defineConfig(({ command }) => ({
  // The deploy sets package.json to the version it releases before building
  // (ADR 0004); the menu, the Releases page and X-App-Version show it.
  define: {
    __APP_VERSION__: JSON.stringify(
      `${pkg.version}${command === 'serve' ? '-dev' : ''}`
    ),
  },
  server: {
    // shared/ sits outside the admin root; let the dev server serve it.
    fs: { allow: ['.', '../shared'] },
  },
  plugins: [
    releaseNotes(),
    vinext({
      images: { optimizer: imagesOptimizer() },
    }),
    cloudflare({
      viteEnvironment: {
        name: 'rsc',
        childEnvironments: ['ssr'],
      },
    }),
  ],
}))

/**
 * `virtual:release-notes`: the Release notes, read from GitHub once per build
 * (or dev server start) and baked into the bundle, so the Releases page makes
 * no request to GitHub and lists the Releases up to the one being built.
 */
function releaseNotes(): Plugin {
  const id = 'virtual:release-notes'
  let json: string | undefined
  return {
    name: 'anime-ep-checker-release-notes',
    resolveId: (source) => (source === id ? `\0${id}` : undefined),
    load(resolved) {
      if (resolved !== `\0${id}`) return
      json ??= JSON.stringify(loadReleaseNotes())
      return `export default ${json};`
    },
  }
}
