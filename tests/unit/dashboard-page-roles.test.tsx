// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

/**
 * Hoy es la pantalla del mostrador y la ven el dueño Y el Encargado (decisión del
 * dueño, 2026-09-19). Lo que sigue siendo SOLO del dueño es la configuración del
 * complejo: el checklist de arranque y el tour. Sin este test, nada de lo que
 * corre en CI se entera si alguien los vuelve a mostrar al Encargado — y el tour
 * es peor que un estorbo: `markTourSeenAction` lo dejaría pasar y marcaría como
 * visto el tour del DUEÑO.
 *
 * Se llama a la página como función (es un Server Component async) con todo lo
 * que toca la base y las Server Actions reemplazado, y los bloques de UI por
 * marcadores: lo que se prueba es QUÉ decide mostrar cada rol.
 */

const state = vi.hoisted(() => ({
  role: 'admin' as 'admin' | 'manager',
  settings: { onboarding_completed: true } as Record<string, unknown>,
  getChecklistState: vi.fn(),
}))

vi.mock('@/modules/staff/guards', () => ({
  requireOperatorStaff: async () => ({
    ok: true,
    role: state.role,
    tenant: {
      id: 't1',
      slug: 'complejo',
      openingHours: {
        mon: { open: '08:00', close: '23:00' },
        tue: { open: '08:00', close: '23:00' },
        wed: { open: '08:00', close: '23:00' },
        thu: { open: '08:00', close: '23:00' },
        fri: { open: '08:00', close: '23:00' },
        sat: { open: '08:00', close: '23:00' },
        sun: { open: '08:00', close: '23:00' },
      },
      closedDates: [],
      closesNextDay: false,
      mpConnectedAt: null,
      // Un complejo con el onboarding hecho, el tour sin ver y la checklist sin
      // descartar: es cuando el dueño ve las dos cosas.
      settings: state.settings,
    },
  }),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: async (_tenantId: string, fn: (tx: unknown) => unknown) => fn({}),
}))
vi.mock('@/modules/home/home.service', () => ({
  getHoyData: async () => ({
    date: '2026-09-18',
    numbers: {
      collectedTodayCents: 0,
      occupancy: { occupied: 0, available: 0, blocked: 0, pct: 0 },
    },
    whileYouWereAway: [],
    needsAttention: [],
  }),
}))
vi.mock('@/modules/courts/court.service', () => ({ listCourts: async () => [] }))
vi.mock('@/modules/canteen/canteen.service', () => ({ listProducts: async () => [] }))
vi.mock('@/app/(admin)/reservas/queries', () => ({ listDayGridBookings: async () => [] }))
vi.mock('@/app/(admin)/dashboard/queries', () => ({ getChecklistState: state.getChecklistState }))
vi.mock('@/app/(admin)/dashboard/actions', () => ({
  markPublicLinkSharedAction: vi.fn(),
  markTourSeenAction: vi.fn(),
  markChecklistDismissedAction: vi.fn(),
}))
vi.mock('@/app/(admin)/reservas/actions', () => ({
  addBookingChargeAction: vi.fn(),
  cancelBookingAction: vi.fn(),
  completeAndChargeBookingAction: vi.fn(),
  confirmDepositPaymentAction: vi.fn(),
  editBookingAction: vi.fn(),
  listRescheduleSlotsAction: vi.fn(),
  markNoShowAction: vi.fn(),
  releaseBlockAction: vi.fn(),
  rescheduleBookingAction: vi.fn(),
  revertNoShowAction: vi.fn(),
}))
vi.mock('@/app/(admin)/reservas/edit-detail-actions', () => ({
  getBookingEditDetailAction: vi.fn(),
}))
vi.mock('@/app/(admin)/caja/deudas/actions', () => ({ chargeDebtAction: vi.fn() }))
vi.mock('@/app/(admin)/caja/cantina/actions', () => ({
  createTabAction: vi.fn(),
  listCanteenForBookingAction: vi.fn(),
  sellTicketAction: vi.fn(),
}))

/** Un bloque de UI reemplazado por un marcador: `stub('Nombre', 'id')` → `{ Nombre: () => <div data-testid="id" /> }`. */
const stub = vi.hoisted(() => async (name: string, testId: string) => {
  const { createElement } = await import('react')
  return { [name]: () => createElement('div', { 'data-testid': testId }) }
})
vi.mock('@/components/dashboard/onboarding-checklist', () =>
  stub('OnboardingChecklist', 'checklist'),
)
vi.mock('@/components/dashboard/dashboard-tour', () => stub('DashboardTour', 'tour'))
vi.mock('@/components/dashboard/WhileYouWereAway', () => stub('WhileYouWereAway', 'away'))
vi.mock('@/components/dashboard/NeedsAttention', () => stub('NeedsAttention', 'attention'))
// El tablero deja a la vista lo que la página le decide pasar: solo el dueño puede
// activar canchas, y al Encargado no se le ofrece un link que lo rebota.
vi.mock('@/app/(admin)/dashboard/_components/HoyShell', async () => {
  const { createElement } = await import('react')
  return {
    HoyShell: (props: { canManageCourts: boolean }) =>
      createElement('div', {
        'data-testid': 'board',
        'data-can-manage-courts': String(props.canManageCourts),
      }),
  }
})
vi.mock('@/app/(admin)/dashboard/HoyHeaderSlot', () => stub('HoyHeaderSlot', 'header'))
vi.mock('@/app/(admin)/dashboard/_components/VenderRail', () => stub('VenderRail', 'vender'))
// El proveedor deja pasar lo que envuelve: sin eso desaparecería toda la página.
vi.mock('@/app/(admin)/dashboard/_components/VenderProvider', async () => {
  const { createElement, Fragment } = await import('react')
  return {
    VenderProvider: (props: { children: React.ReactNode }) =>
      createElement(Fragment, null, props.children),
  }
})

import DashboardPage from '@/app/(admin)/dashboard/page'

beforeEach(() => {
  // Con la checklist incompleta, el dueño la ve.
  state.settings = { onboarding_completed: true }
  state.getChecklistState.mockReset()
  state.getChecklistState.mockResolvedValue({ courts: false, hours: false })
})

afterEach(cleanup)

describe('Hoy — qué ve cada rol', () => {
  it('el dueño ve el tablero, el checklist de arranque y el tour', async () => {
    state.role = 'admin'
    render(await DashboardPage())

    expect(screen.getByTestId('board')).toHaveAttribute('data-can-manage-courts', 'true')
    expect(screen.getByTestId('checklist')).toBeInTheDocument()
    expect(screen.getByTestId('tour')).toBeInTheDocument()
    expect(state.getChecklistState).toHaveBeenCalledTimes(1)
  })

  it('el Encargado ve el tablero, pero NO el checklist ni el tour de configuración', async () => {
    state.role = 'manager'
    render(await DashboardPage())

    expect(screen.getByTestId('board')).toHaveAttribute('data-can-manage-courts', 'false')
    expect(screen.getByTestId('attention')).toBeInTheDocument()
    expect(screen.queryByTestId('checklist')).toBeNull()
    expect(screen.queryByTestId('tour')).toBeNull()
  })

  it('si el dueño ya descartó el checklist, tampoco se consulta (Hoy se refresca cada minuto)', async () => {
    state.role = 'admin'
    state.settings = { onboarding_completed: true, checklist_dismissed_at: '2026-09-01T00:00:00Z' }
    render(await DashboardPage())

    expect(state.getChecklistState).not.toHaveBeenCalled()
    expect(screen.queryByTestId('checklist')).toBeNull()
  })

  it('los dos roles ven la venta: Caja es de los dos', async () => {
    for (const role of ['admin', 'manager'] as const) {
      state.role = role
      const { unmount } = render(await DashboardPage())
      expect(screen.getByTestId('vender')).toBeInTheDocument()
      unmount()
    }
  })

  it('al Encargado ni siquiera se le pagan las consultas del checklist', async () => {
    state.role = 'manager'
    await DashboardPage()

    expect(state.getChecklistState).not.toHaveBeenCalled()
  })
})
