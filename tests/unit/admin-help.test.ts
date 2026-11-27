import { describe, expect, it } from 'vitest'
import { getHelpGuides, getHelpReportHref } from '@/components/layout/admin-help-guides'

const manager = { pathname: '/grilla', staffRole: 'manager' } as const

describe('Ayuda del panel', () => {
  it('sugiere primero las tareas de la pantalla actual', () => {
    expect(getHelpGuides({ ...manager, query: '' })[0]?.id).toBe('create-fixed-booking')
    expect(getHelpGuides({ ...manager, pathname: '/abonados', query: '' })[0]?.id).toBe(
      'list-fixed-bookings',
    )
  })

  it.each(['ABONADO', 'turno semanal', '¿Dónde están los turnos fijos?'])(
    'encuentra los turnos fijos al buscar %s',
    (query) => {
      const guides = getHelpGuides({ ...manager, query })

      expect(guides[0]?.href).toBe('/abonados')
      expect(guides).toContainEqual(expect.objectContaining({ href: '/abonados/nuevo' }))
    },
  )

  it('reserva las guías de ajustes para el dueño', () => {
    expect(getHelpGuides({ ...manager, query: 'precio' })).toEqual([])
    expect(getHelpGuides({ ...manager, staffRole: 'admin', query: 'precio' })[0]?.href).toBe(
      '/canchas',
    )
  })

  it('mantiene las guías de consulta en modo solo lectura', () => {
    const results = getHelpGuides({ ...manager, query: '', readOnly: true, staffRole: 'admin' })

    expect(results.map(({ href }) => href)).toEqual(['/abonados', '/caja/cuentas'])
    expect(getHelpGuides({ ...manager, query: 'crear turno fijo', readOnly: true })).toEqual([])
  })

  it('precarga una sección reconocible en el correo de soporte', () => {
    const report = new URL(getHelpReportHref('/reservas/detalle-de-reserva'))
    const decoded = decodeURIComponent(report.href)

    expect(report.protocol).toBe('mailto:')
    expect(report.searchParams.get('body')).toContain('Sección: Agenda')
    expect(decoded).not.toContain('detalle-de-reserva')
  })
})
