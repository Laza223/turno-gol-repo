// @vitest-environment happy-dom
/**
 * CajaTabs (clon de SettingsTabs, pattern /settings): 3 links con sus hrefs y
 * aria-current en el tab activo.
 *
 * Tres destinos, no cuatro: el rediseño fusionó Deudas y Devoluciones en
 * Cuentas, que es la única pantalla de Caja que muestra plata agregada.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ADMIN_HEADER_SLOT_ID } from '@/components/layout/admin-header-slot'
import { CajaTabs } from '@/app/(admin)/caja/components/CajaTabs'

// `CajaTabs` portea su contenido al hueco de la barra superior del panel
// (MASTER §6.8). Sin ese nodo en el documento el componente renderiza null a
// propósito, así que el test tiene que montarlo igual que hace el armazón.
beforeEach(() => {
  const host = document.createElement('div')
  host.id = ADMIN_HEADER_SLOT_ID
  document.body.appendChild(host)
})

afterEach(() => {
  cleanup()
  document.getElementById(ADMIN_HEADER_SLOT_ID)?.remove()
})

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

  // El aviso de stock bajo es un punto sin texto visible: si no viajara en el
  // nombre accesible, quien no ve color no se enteraría nunca (MASTER §10).
  it('con productos para reponer, "Productos" lo dice en su nombre accesible', () => {
    render(<CajaTabs active="/caja" lowStock={2} />)
    expect(
      screen.getByRole('link', { name: 'Productos — 2 productos para reponer' }),
    ).toHaveAttribute('href', '/caja/productos')
    // El aviso cuelga SOLO de Productos: los otros dos destinos no cambian.
    expect(screen.getByRole('link', { name: 'Vender' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cuentas' })).toBeInTheDocument()
  })

  it('en singular con un solo producto, y sin aviso con cero', () => {
    const { unmount } = render(<CajaTabs active="/caja" lowStock={1} />)
    expect(
      screen.getByRole('link', { name: 'Productos — 1 producto para reponer' }),
    ).toBeInTheDocument()
    unmount()

    render(<CajaTabs active="/caja" lowStock={0} />)
    expect(screen.getByRole('link', { name: 'Productos' })).toBeInTheDocument()
  })
})
