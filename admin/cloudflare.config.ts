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
      // App badge push subscriptions, one per device (ADR 0003).
      PUSH_SUBSCRIPTIONS: bindings.kv({
        // Provisioned by the first deploy; pinned so later deploys can't create a new one.
        id: '5fd07bfe1e3a4e0c82a8e92045106932',
      }),
      ADMIN_PASSWORD: bindings.secret(),
      ADMIN_SESSION_SECRET: bindings.secret(),
      GITHUB_TOKEN: bindings.secret(),
      GITHUB_REPO: bindings.secret(),
      GITHUB_BRANCH: bindings.secret(),
      MAL_CLIENT_ID: bindings.secret(),
      MAL_CLIENT_SECRET: bindings.secret(),
      MAL_REDIRECT_URI: bindings.secret(),
      MAL_REFRESH_TOKEN: bindings.secret(),
      VAPID_PUBLIC_KEY: bindings.secret(),
      VAPID_PRIVATE_KEY: bindings.secret(),
      PUSH_TRIGGER_SECRET: bindings.secret(),
    },
  }),
})
