import { TopHeader } from '@/app/components/TopHeader'
import type { ReactNode } from 'react'

// The four list pages share one header. It stays mounted while you move
// between them, so search (and its index) isn't rebuilt on every navigation.
// /login and /mal sit outside this group and have no header.
export default function ListsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopHeader />
      {children}
    </>
  )
}
