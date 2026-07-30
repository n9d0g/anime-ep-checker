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
        src: '/icon.jpg',
        type: 'image/jpeg',
        sizes: '500x494',
        purpose: 'any',
      },
    ],
  }
}
