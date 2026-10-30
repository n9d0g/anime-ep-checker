import { ListTabs } from '@/app/components/ListTabs'
import { TopHeader } from '@/app/components/TopHeader'
import type { ReactNode } from 'react'

// The four list pages share one header and the list tabs. They stay mounted
// while you move between them, so search (and its index) isn't rebuilt on
// every navigation. /login and /mal sit outside this group and have neither.
export default function ListsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <TopHeader />
      {children}
      <ListTabs placement="bottom" />
    </>
  )
}
