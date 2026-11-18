'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Link2, LogOut, X, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { useAppBadgeActions } from '@/app/components/useAppBadgeActions'
import { useIsDesktop } from '@/app/components/useIsDesktop'

/** The version running here, without dev's "-dev". */
const VERSION = `v${__APP_VERSION__.replace(/-dev$/, '')}`

/**
 * The Account menu (GLOSSARY.md): MAL setup, the App badge, Log out and the
 * running version, which opens the Release notes. A dropdown on a computer;
 * a full-height drawer from the right on a phone or tablet, with the version
 * at the very bottom.
 */
export function AccountMenu({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const close = () => onOpenChange(false)
  const badgeActions = useAppBadgeActions(close)

  async function logout() {
    close()
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
    router.refresh()
  }

  const trigger = (
    <button
      className="account-menu-btn"
      type="button"
      aria-label="Account menu"
    >
      <img src="/icons/icon-192.png" alt="" />
    </button>
  )

  if (isDesktop) {
    return (
      <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="min-w-48">
          <DropdownMenuItem asChild>
            <Link href="/mal">
              <Link2 />
              MAL setup
            </Link>
          </DropdownMenuItem>
          {badgeActions.length > 0 ? <DropdownMenuSeparator /> : null}
          {badgeActions.map((action) => (
            <DropdownMenuItem
              key={action.key}
              disabled={action.disabled}
              onSelect={action.onSelect}
            >
              <action.icon />
              {action.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => void logout()}
          >
            <LogOut />
            Log out
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            asChild
            className="text-muted-foreground tabular-nums"
          >
            <Link href="/releases" aria-label={`Release notes, ${VERSION}`}>
              {VERSION}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="flex-row items-center justify-between border-b px-4 py-3">
          <DrawerTitle className="text-base">Account</DrawerTitle>
          <DrawerDescription className="sr-only">
            MAL setup, the app badge, logging out and the version
          </DrawerDescription>
          <DrawerClose
            className="-mr-2 flex size-10 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" />
          </DrawerClose>
        </DrawerHeader>
        <nav className="flex flex-col gap-1 p-2">
          <DrawerRow icon={Link2} href="/mal" onClick={close}>
            MAL setup
          </DrawerRow>
          {badgeActions.map((action) => (
            <DrawerRow
              key={action.key}
              icon={action.icon}
              disabled={action.disabled}
              onClick={action.onSelect}
            >
              {action.label}
            </DrawerRow>
          ))}
          <DrawerRow icon={LogOut} destructive onClick={() => void logout()}>
            Log out
          </DrawerRow>
        </nav>
        <DrawerFooter className="items-center pb-6">
          <Link
            href="/releases"
            onClick={close}
            aria-label={`Release notes, ${VERSION}`}
            className="rounded-md px-3 py-2 text-sm text-muted-foreground tabular-nums hover:bg-accent hover:text-foreground"
          >
            {VERSION}
          </Link>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

const ROW_CLASS =
  'flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-left text-[0.95rem] font-medium hover:bg-accent disabled:cursor-default disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground'

function DrawerRow({
  icon: Icon,
  href,
  destructive = false,
  disabled = false,
  onClick,
  children,
}: {
  icon: LucideIcon
  href?: string
  destructive?: boolean
  disabled?: boolean
  onClick: () => void
  children: string
}) {
  const className = destructive
    ? `${ROW_CLASS} text-destructive hover:bg-destructive/10 [&_svg]:text-destructive`
    : ROW_CLASS
  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className}>
        <Icon aria-hidden="true" />
        {children}
      </Link>
    )
  }
  return (
    <button
      type="button"
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" />
      {children}
    </button>
  )
}
