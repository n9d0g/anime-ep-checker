import { defineConfig } from 'vite'
import vinext from 'vinext'
import { cloudflare } from '@cloudflare/vite-plugin'
import { imagesOptimizer } from '@vinext/cloudflare/images/images-optimizer'

export default defineConfig({
  server: {
    // shared/ sits outside the admin root; let the dev server serve it.
    fs: { allow: ['.', '../shared'] },
  },
  plugins: [
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
})
