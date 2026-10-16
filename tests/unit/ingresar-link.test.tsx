// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { sanitizeNext } from '@/lib/safe-redirect'

// Lo que devuelven los hooks de next/navigation en cada caso. `suspende` simula el render
// estático/ISR, donde `useSearchParams()` corta hasta el Suspense más cercano.
const nav = vi.hoisted(() => ({
  pathname: '/' as string | null,
  search: '',
  suspende: false,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => {
    if (nav.suspende) throw new Promise(() => {})
    return new URLSearchParams(nav.search)
  },
}))

import { IngresarLink } from '@/components/site/IngresarLink'

afterEach(() => {
  cleanup()
  nav.pathname = '/'
  nav.search = ''
  nav.suspende = false
})

function hrefDelLink(): string {
  render(<IngresarLink>Ingresar</IngresarLink>)
  return screen.getByRole('link', { name: 'Ingresar' }).getAttribute('href')!
}

const nextDe = (href: string) => new URL(href, 'http://localhost').searchParams.get('next')

describe('IngresarLink', () => {
  it('lleva la página actual con su query, codificada', () => {
    nav.pathname = '/explorar'
    nav.search = 'city=Rosario&q=palermo'
    expect(hrefDelLink()).toBe('/ingresar?next=%2Fexplorar%3Fcity%3DRosario%26q%3Dpalermo')
  })

  it('sin query lleva solo el pathname', () => {
    nav.pathname = '/complejos/el-vagon'
    expect(hrefDelLink()).toBe('/ingresar?next=%2Fcomplejos%2Fel-vagon')
  })

  it('la home es next=%2F', () => {
    expect(hrefDelLink()).toBe('/ingresar?next=%2F')
  })

  it('el valor sobrevive al viaje: tildes, espacios y & vuelven a la misma ruta y sanitizeNext lo acepta', () => {
    nav.pathname = '/explorar'
    nav.search = new URLSearchParams({ q: 'Fútbol 5 & más', day: '2026-10-17' }).toString()
    const next = nextDe(hrefDelLink())
    expect(next).toBe('/explorar?q=F%C3%BAtbol+5+%26+m%C3%A1s&day=2026-10-17')
    expect(sanitizeNext(next)).toBe(next)
  })

  it('en el render estático (useSearchParams suspende) el fallback lleva solo el pathname', () => {
    nav.pathname = '/explorar'
    nav.search = 'city=Rosario'
    nav.suspende = true
    expect(hrefDelLink()).toBe('/ingresar?next=%2Fexplorar')
  })

  it('sin pathname queda el /ingresar pelado', () => {
    nav.pathname = null
    expect(hrefDelLink()).toBe('/ingresar')
  })

  it('aplica el className que le pasa quien lo usa', () => {
    render(<IngresarLink className="cta">Ingresar</IngresarLink>)
    expect(screen.getByRole('link', { name: 'Ingresar' }).className).toBe('cta')
  })
})
