import './globals.css'
import { Inter } from 'next/font/google'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Anime Episode Checker',
  description: 'Manage tracked Crunchyroll, Netflix, and Disney+ shows',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.jpg',
    apple: '/apple-icon.jpg',
  },
  appleWebApp: {
    capable: true,
    title: 'Anime Episode Checker',
    statusBarStyle: 'black-translucent',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
