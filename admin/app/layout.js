import './globals.css'

export const metadata = {
  title: 'Anime Episode Checker',
  description: 'Manage tracked Crunchyroll shows',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
