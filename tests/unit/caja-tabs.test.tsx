// @vitest-environment happy-dom
/**
 * CajaTabs (clon de SettingsTabs, pattern /settings): 3 links con sus hrefs y
 * aria-current en el tab activo.
 *
 * Tres destinos, no cuatro: el rediseño fusionó Deudas y Devoluciones en
 * Cuentas, que es la única pantalla de Caja que muestra plata agregada.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CajaTabs } from '@/app/(admin)/caja/components/CajaTabs'

afterEach(cleanup)

describe('CajaTabs', () => {
  it('renderiza los 3 links con sus hrefs', () => {
    render(<CajaTabs active="/caja" />)
    expect(screen.getByRole('link', { name: 'Vender' })).toHaveAttribute('href', '/caja')
    expect(screen.getByRole('link', { name: 'Cuentas' })).toHaveAttribute('href', '/caja/cuentas')
    expect(screen.getByRole('link', { name: 'Productos' })).toHaveAttribute(
      'href',
      '/caja/productos',
    )
  })

  it('ya no ofrece Deudas ni Devoluciones como destinos propios', () => {
    render(<CajaTabs active="/caja" />)
    expect(screen.queryByRole('link', { name: 'Deudas' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Devoluciones' })).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('marca aria-current="page" solo en el tab activo', () => {
    render(<CajaTabs active="/caja" />)
    expect(screen.getByRole('link', { name: 'Vender' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Cuentas' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Productos' })).not.toHaveAttribute('aria-current')
  })

  it('marca Cuentas cuando es la pantalla activa', () => {
    render(<CajaTabs active="/caja/cuentas" />)
    expect(screen.getByRole('link', { name: 'Cuentas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Vender' })).not.toHaveAttribute('aria-current')
  })
})
