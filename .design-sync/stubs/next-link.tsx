// Browser stub for `next/link` — the real module pulls Next's router runtime,
// which can't bundle/render outside a Next app. A plain anchor is the correct
// visual for a design-system preview.
import * as React from 'react'

type LinkProps = {
  href?: string | { pathname?: string }
  children?: React.ReactNode
  [key: string]: unknown
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, children, ...props },
  ref,
) {
  const h = typeof href === 'string' ? href : href?.pathname ?? '#'
  return React.createElement('a', { href: h, ref, ...props }, children)
})

export default Link
