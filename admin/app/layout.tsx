import './globals.css'
import { ToastProvider } from '@/app/components/Toast'
import { getAdminPublicOrigin } from '@/lib/site-url'
import { Inter } from 'next/font/google'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

const siteTitle = 'Anime Episode Checker'
const siteDescription =
  'Manage tracked Crunchyroll, Netflix, and Disney+ shows'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  metadataBase: new URL(getAdminPublicOrigin()),
  title: siteTitle,
  description: siteDescription,
  openGraph: {
    type: 'website',
    siteName: siteTitle,
    title: siteTitle,
    description: siteDescription,
    url: '/',
    images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: siteTitle }],
  },
  twitter: {
    card: 'summary',
    title: siteTitle,
    description: siteDescription,
    images: ['/icons/icon-512.png'],
  },
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: siteTitle,
    statusBarStyle: 'black-translucent',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
