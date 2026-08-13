// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { HorariosActionResult } from '@/app/(admin)/settings/horarios/actions'

// RemoveClosedDateForm usa useRouter() para refrescar tras el Deshacer (§6.2 clase A).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

// useActionState/useFormStatus son undefined en vitest: mock para testear la
// presentacion del feedback (#19).
//
// React 19: useFormState (react-dom) pasó a ser useActionState (react), así que
// el mock tiene que ir a 'react'. useFormStatus NO se movió: sigue en react-dom.
// Ojo: si esto se dejara sólo en react-dom, el mock dejaría de interceptar y el
// test seguiría en verde sin testear nada.
const formState = vi.fn()
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useActionState: (_action: unknown, initial: unknown) => [
      formState() ?? initial,
      vi.fn(),
      false,
    ],
  }
})
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-dom')>()
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
  }
})

import { AddClosedDateForm } from '@/app/(admin)/settings/horarios/AddClosedDateForm'
import { HorariosForm } from '@/app/(admin)/settings/horarios/HorariosForm'
import { RemoveClosedDateForm } from '@/app/(admin)/settings/horarios/RemoveClosedDateForm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'

// Regresión 05-horarios-mindate-utc: la page usaba el reloj UTC crudo del
// server para "hoy" en vez de artTodayStr(). Se mockean los mismos dos puntos
// que usa el resto del repo para esta page (ver facturacion-page.test.tsx) y
// se deja el reloj real de '@/shared/dates/art' para ejercitar la conversión
// ART de verdad.
vi.mock('@/modules/auth/auth.middleware', () => ({ extractAuthUser: vi.fn() }))
vi.mock('@/modules/tenants/tenant.service', () => ({ getStaffTenant: vi.fn() }))
// La page importa ./actions (Server Actions) para pasarlas como prop — esas
// actions importan '@/shared/rate-limit/server-action' y '@/shared/db/client',
// que arrastran @sentry/nextjs y postgres reales. Mismo mock que usa el resto
// del repo (ver booking-charge-action.test.ts, facturacion-page.test.tsx) para
// no pagar ese costo/colgarse en un test que nunca invoca las actions.
vi.mock('@/shared/rate-limit/server-action', () => ({ adminRateLimited: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  withTenantContext: vi.fn(async (_id: string, cb: (tx: unknown) => unknown) => cb({})),
}))

afterEach(() => cleanup())

// Ya no hace falta un vi.mock de '.../horarios/actions' para evitar cargar
// drizzle/postgres al importar los componentes: las Server Actions entran por
// prop (ver ReservasPolicyForm.tsx).
const noopAction = vi.fn(async (): Promise<HorariosActionResult> => ({ success: true }))

describe('HorariosForms — feedback (#19)', () => {
  it('HorariosForm muestra el error que devuelve la action', () => {
    formState.mockReturnValue({ success: false, error: 'Formato HH:MM' })
    render(<HorariosForm hours={{}} closesNextDay={false} action={noopAction} />)
    expect(screen.getByRole('alert').textContent).toContain('Formato HH:MM')
  })

  it('AddClosedDateForm muestra el error que devuelve la action', () => {
    formState.mockReturnValue({ success: false, error: 'Fecha inválida.' })
    render(<AddClosedDateForm minDate="2026-06-09" action={noopAction} />)
    expect(screen.getByRole('alert').textContent).toContain('Fecha inválida.')
  })

  it('RemoveClosedDateForm muestra el error que devuelve la action', () => {
    formState.mockReturnValue({ success: false, error: 'PIN requerido.' })
    render(<RemoveClosedDateForm date="2026-06-09" action={noopAction} />)
    expect(screen.getByRole('alert').textContent).toContain('PIN requerido.')
  })

  it('sin error no renderiza ninguna alerta', () => {
    formState.mockReturnValue({ success: true })
    render(<HorariosForm hours={{}} closesNextDay={false} action={noopAction} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('HorariosPage — minDate en ART (regresión 05-horarios-mindate-utc)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('usa el día ART de hoy: no oculta el cierre de hoy ni adelanta el mínimo del form', async () => {
    // Timeout ampliado (default 10s): esta page importa ./actions, que arrastra
    // drizzle/postgres reales aunque estén mockeados los efectos — el cold
    // transform de ese grafo de módulos puede pasar el default en máquinas lentas.
    // 2026-06-13T01:30:00Z = 2026-06-12T22:30 ART (UTC-3): el reloj UTC crudo
    // ya cayó en el día calendario siguiente, pero en ART todavía es 06-12.
    // Solo se fakea `Date`: fakear setTimeout/MessageChannel también cuelga
    // el render de React (scheduler interno los usa y nunca los avanzamos).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-06-13T01:30:00.000Z'))

    formState.mockReturnValue({ success: true })
    vi.mocked(extractAuthUser).mockResolvedValue({
      type: 'staff',
      staffUserId: 'staff-1',
      tenantId: 't-1',
      id: 'auth-1',
      email: 'a@b.com',
    } as never)
    vi.mocked(getStaffTenant).mockResolvedValue({
      openingHours: {},
      closedDates: ['2026-06-11', '2026-06-12', '2026-06-13'],
      closesNextDay: false,
    } as never)

    const HorariosPage = (await import('@/app/(admin)/settings/horarios/page')).default
    render(await HorariosPage())

    // El cierre de HOY (ART 06-12) sigue en la lista — con el bug, minDate
    // caía en 06-13 y este filtro (`d >= minDate`) lo hacía desaparecer.
    expect(screen.getByText(/12 de junio de 2026/)).toBeTruthy()
    // El cierre vencido (06-11, anterior a hoy ART) sigue filtrado de la lista.
    expect(screen.queryByText(/11 de junio de 2026/)).toBeNull()

    // El <input type="date"> de "Agregar día cerrado" acepta hoy en ART, no
    // un día adelantado por el reloj UTC del server.
    const input = screen.getByLabelText('Agregar día cerrado') as HTMLInputElement
    expect(input.min).toBe('2026-06-12')
  }, 20_000)
})
