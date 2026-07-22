// @vitest-environment happy-dom
/**
 * CajaTabs (clon de SettingsTabs, pattern /settings): 3 links con sus hrefs
 * y aria-current en el tab activo.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CajaTabs } from '@/app/(admin)/caja/components/CajaTabs'

afterEach(cleanup)

describe('CajaTabs', () => {
  it('renderiza los 3 links con sus hrefs', () => {
    render(<CajaTabs active="/caja" />)
    expect(screen.getByRole('link', { name: 'Caja del día' })).toHaveAttribute('href', '/caja')
    expect(screen.getByRole('link', { name: 'Cantina' })).toHaveAttribute('href', '/caja/cantina')
    expect(screen.getByRole('link', { name: 'Productos y stock' })).toHaveAttribute(
      'href',
      '/caja/productos',
    )
  })

  it('marca aria-current="page" solo en el tab activo', () => {
    render(<CajaTabs active="/caja/cantina" />)
    expect(screen.getByRole('link', { name: 'Cantina' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Caja del día' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Productos y stock' })).not.toHaveAttribute('aria-current')
  })
})
