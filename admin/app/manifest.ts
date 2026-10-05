import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Anime Episode Checker',
    short_name: 'Ep Checker',
    display: 'standalone',
    theme_color: '#111111',
    background_color: '#111111',
    icons: [
      {
        src: '/icons/icon-192.png',
        type: 'image/png',
        sizes: '192x192',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        type: 'image/png',
        sizes: '512x512',
        purpose: 'any',
      },
    ],
  }
}
