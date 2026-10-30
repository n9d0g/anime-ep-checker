'use client'

// PROTOTYPE: throwaway variant switcher for /prototype/* routes. Never
// rendered in production builds.
import { useEffect, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export function PrototypeSwitcher({
  variants,
  current,
  children,
}: {
  variants: { key: string; name: string }[]
  current: string
  /** Extra prototype-only controls shown after the variant label. */
  children?: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current)
  )

  function go(step: number) {
    const next = variants[(index + step + variants.length) % variants.length]
    const params = new URLSearchParams(window.location.search)
    params.set('variant', next.key)
    router.replace(`${pathname}?${params}`)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        target?.isContentEditable
      ) {
        return
      }
      if (event.key === 'ArrowLeft') go(-1)
      if (event.key === 'ArrowRight') go(1)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  if (process.env.NODE_ENV === 'production') {
    return null
  }

  const variant = variants[index]
  return (
    <div className="prototype-switcher" role="toolbar" aria-label="Prototype">
      <button type="button" aria-label="Previous variant" onClick={() => go(-1)}>
        ←
      </button>
      <span>
        {variant.key} ({variant.name})
      </span>
      <button type="button" aria-label="Next variant" onClick={() => go(1)}>
        →
      </button>
      {children}
    </div>
  )
}
