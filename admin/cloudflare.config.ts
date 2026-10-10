import { bindings, defineConfig, defineWorker } from 'cf/config'

export default defineConfig({
  worker: defineWorker({
    name: 'anime-ep-checker-admin',
    entrypoint: 'vinext/server/fetch-handler',
    compatibilityDate: '2026-10-05',
    compatibilityFlags: ['nodejs_compat'],
    domains: ['anime-ep-checker.dev'],
    workersDev: false,
    assets: { notFoundHandling: 'none' },
    env: {
      ASSETS: bindings.assets(),
      IMAGES: bindings.images(),
      ADMIN_PASSWORD: bindings.secret(),
      GITHUB_TOKEN: bindings.secret(),
      GITHUB_REPO: bindings.secret(),
      GITHUB_BRANCH: bindings.secret(),
      MAL_CLIENT_ID: bindings.secret(),
      MAL_CLIENT_SECRET: bindings.secret(),
      MAL_REDIRECT_URI: bindings.secret(),
      MAL_REFRESH_TOKEN: bindings.secret(),
    },
  }),
})
