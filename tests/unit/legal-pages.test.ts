import { describe, expect, it } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

import PrivacyPage, { metadata as privacyMetadata } from '@/app/(public)/privacy/page'
import TermsPage, { metadata as termsMetadata } from '@/app/(public)/terms/page'
import SiteFooter from '@/components/site/SiteFooter'

/**
 * The vitest environment is `node` (see vitest.config.ts) and the project does not
 * ship with @testing-library/react or jsdom. To avoid adding new dependencies we
 * exercise these server components at the JSX tree level: invoke the component
 * function and walk the returned React element tree looking for the props we care
 * about. This is enough to catch import regressions, metadata typos and
 * accidental removal of the legal links.
 */

type ReactNodeLike = ReactElement | string | number | boolean | null | undefined | Iterable<ReactNodeLike>

function walkAll(
  node: ReactNodeLike,
  onElement: (el: ReactElement) => void,
  onLeaf: (leaf: string | number) => void,
): void {
  if (node === null || node === undefined || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') {
    onLeaf(node)
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) walkAll(child as ReactNodeLike, onElement, onLeaf)
    return
  }
  if (isValidElement(node)) {
    onElement(node)
    const children = (node.props as { children?: ReactNode }).children
    if (children !== undefined) walkAll(children as ReactNodeLike, onElement, onLeaf)
  }
}

function collectHrefs(root: ReactElement): string[] {
  const hrefs: string[] = []
  walkAll(
    root,
    (el) => {
      const props = el.props as { href?: unknown }
      if (typeof props.href === 'string') hrefs.push(props.href)
    },
    () => {},
  )
  return hrefs
}

function collectText(root: ReactElement): string {
  let buf = ''
  walkAll(
    root,
    () => {},
    (leaf) => {
      buf += ` ${leaf}`
    },
  )
  return buf
}

describe('privacy page', () => {
  it('exports metadata with the expected title and description', () => {
    // El título es solo la parte específica; el template del root layout añade " · TurnoGol".
    expect(privacyMetadata.title).toBe('Política de Privacidad')
    expect(privacyMetadata.description).toMatch(/Ley 25\.326/)
  })

  it('renders a React element tree', () => {
    const tree = PrivacyPage()
    expect(isValidElement(tree)).toBe(true)
  })

  it('mentions key compliance concepts in the rendered text', () => {
    const text = collectText(PrivacyPage())
    expect(text).toMatch(/ARCO/)
    expect(text).toMatch(/AAIP/)
    expect(text).toMatch(/MercadoPago/)
    expect(text).toMatch(/Supabase/)
    expect(text).toMatch(/privacidad@turnogol\.com\.ar/)
  })

  it('exposes the data-export endpoint', () => {
    const text = collectText(PrivacyPage())
    expect(text).toMatch(/\/api\/player\/data-export/)
  })
})

describe('terms page', () => {
  it('exports metadata with the expected title and description', () => {
    expect(termsMetadata.title).toBe('Términos y Condiciones')
    expect(termsMetadata.description).toMatch(/TurnoGol/)
  })

  it('renders a React element tree', () => {
    const tree = TermsPage()
    expect(isValidElement(tree)).toBe(true)
  })

  it('mentions the core legal concepts in the rendered text', () => {
    const text = collectText(TermsPage())
    expect(text).toMatch(/intermediario/i)
    expect(text).toMatch(/MercadoPago/)
    expect(text).toMatch(/mayor(es)? de 18/i)
    expect(text).toMatch(/Ciudad Autónoma de Buenos Aires/)
    expect(text).toMatch(/AFIP/)
  })
})

describe('SiteFooter (legal links)', () => {
  it('renders links to /privacy and /terms', () => {
    const tree = SiteFooter()
    expect(isValidElement(tree)).toBe(true)
    const hrefs = collectHrefs(tree)
    expect(hrefs).toContain('/privacy')
    expect(hrefs).toContain('/terms')
  })

  it('renders the expected anchor labels', () => {
    const text = collectText(SiteFooter())
    expect(text).toMatch(/Privacidad/)
    expect(text).toMatch(/Términos/)
    expect(text).toMatch(/TurnoGol/)
  })
})
