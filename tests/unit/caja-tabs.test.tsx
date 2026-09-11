// @vitest-environment happy-dom
/**
 * CajaTabs (clon de SettingsTabs, pattern /settings): 4 links con sus hrefs
 * y aria-current en el tab activo. Cantina pasó a ser la raíz (/caja) tras
 * eliminar "Caja del día".
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CajaTabs } from '@/app/(admin)/caja/components/CajaTabs'

afterEach(cleanup)

describe('CajaTabs', () => {
  it('renderiza los 4 links con sus hrefs', () => {
    render(<CajaTabs active="/caja" />)
    expect(screen.getByRole('link', { name: 'Cantina' })).toHaveAttribute('href', '/caja')
    expect(screen.getByRole('link', { name: 'Deudas' })).toHaveAttribute('href', '/caja/deudas')
    expect(screen.getByRole('link', { name: 'Devoluciones' })).toHaveAttribute(
      'href',
      '/caja/devoluciones',
    )
    expect(screen.getByRole('link', { name: 'Productos y stock' })).toHaveAttribute(
      'href',
      '/caja/productos',
    )
  })

  it('renombre 4.2: la tab de deuda dice "Deudas", no "Plata en la calle"', () => {
    render(<CajaTabs active="/caja" />)
    expect(screen.getByRole('link', { name: 'Deudas' })).toHaveAttribute('href', '/caja/deudas')
  })

  it('marca aria-current="page" solo en el tab activo', () => {
    render(<CajaTabs active="/caja" />)
    expect(screen.getByRole('link', { name: 'Cantina' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Deudas' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Productos y stock' })).not.toHaveAttribute(
      'aria-current',
    )
  })
})
