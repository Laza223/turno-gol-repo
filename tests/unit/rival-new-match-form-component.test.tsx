// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NewMatchForm, type NewMatchTenant } from '@/app/(player)/rival/nuevo/NewMatchForm'
import type { RivalFormResult } from '@/app/(player)/rival/actions'
import type { ScheduleSource } from '@/lib/schedule/open-status'
import { DAY_KEYS } from '@/shared/time/week-days'

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => '/rival/nuevo',
  useSearchParams: () => new URLSearchParams(),
}))

afterEach(() => cleanup())

// Sábado 21:00 ART = 00:00 UTC del domingo.
const BOOKINGS = [{ tenantId: 't1', startsAt: '2026-03-15T00:00:00.000Z' }]
const PREFILL = { tenantId: 't1', date: '2026-03-14', time: '21:00', format: 7 }
// Hoy es sábado 2026-03-14, 15:30 ART.
const TENANT: NewMatchTenant = {
  id: 't1',
  name: 'El Vagón',
  city: 'Luján',
  slug: 'el-vagon',
  schedule: null,
}

const daily = (open: string, close: string, closedDay?: string): ScheduleSource => ({
  openingHours: Object.fromEntries(
    DAY_KEYS.map((k) => [k, { open, close, closed: k === closedDay }]),
  ) as ScheduleSource['openingHours'],
  closedDates: [],
  closesNextDay: false,
})

function renderForm(
  action: () => Promise<RivalFormResult>,
  locked: boolean,
  tenant: NewMatchTenant = TENANT,
  nowTime = '15:30',
) {
  return render(
    <NewMatchForm
      tenants={[tenant]}
      bookings={BOOKINGS}
      prefill={locked ? PREFILL : null}
      today="2026-03-14"
      nowTime={nowTime}
      action={action}
    />,
  )
}

async function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Armar el partido' }))
}

const hidden = (container: HTMLElement, name: string) =>
  (container.querySelector(`input[name="${name}"]`) as HTMLInputElement).value

describe('NewMatchForm — errores de campos que la reserva fijada oculta', () => {
  it.each(['tenantId', 'startsAt', 'format'])(
    'con la reserva fijada, el error de "%s" se ve como alert (no hay campo donde pintarlo)',
    async (field) => {
      renderForm(
        vi.fn(async () => ({
          success: false,
          error: 'Solo se puede armar hasta 7 días adelante.',
          field,
        })),
        true,
      )
      await submit()
      expect((await screen.findByRole('alert')).textContent).toContain('hasta 7 días')
    },
  )

  it('el error general va en el flujo, no dentro de la barra fija (su alto es fijo)', async () => {
    renderForm(
      vi.fn(async () => ({ success: false, error: 'Algo falló.', code: 'rival_limit_active' })),
      true,
    )
    await submit()
    const alert = await screen.findByRole('alert')
    expect(alert.closest('[data-fixed-cta]')).toBeNull()
  })

  it('sin reserva fijada, el error de "startsAt" no se duplica arriba del botón (lo pinta su campo)', async () => {
    renderForm(
      vi.fn(async () => ({ success: false, error: 'Fecha mala.', field: 'startsAt' })),
      false,
    )
    await submit()
    await waitFor(() => expect(screen.queryAllByText('Fecha mala.').length).toBeLessThanOrEqual(1))
  })
})

describe('NewMatchForm — el sello y la reserva que se cayó', () => {
  it('con sello no hay casilla; si el server pide courtDeclared, aparece "Ya tengo la cancha" y se puede seguir', async () => {
    renderForm(
      vi.fn(async () => ({
        success: false,
        error: 'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.',
        field: 'courtDeclared',
      })),
      true,
    )
    expect(screen.queryByRole('checkbox', { name: 'Ya tengo la cancha' })).toBeNull()
    await submit()
    const box = await screen.findByRole('checkbox', { name: 'Ya tengo la cancha' })
    expect(screen.getByRole('alert').textContent).toContain(
      'Marcá "Ya tengo la cancha": no se arman partidos sin cancha.',
    )
    fireEvent.click(box)
    expect((box as HTMLInputElement).checked).toBe(true)
  })
})

describe('NewMatchForm — errores por campo', () => {
  const EMPTY = {
    success: false as const,
    error: 'Elegí el complejo.',
    field: 'tenantId',
    fieldErrors: {
      tenantId: 'Elegí el complejo.',
      startsAt: 'Elegí la hora.',
      courtDeclared: 'Marcá "Ya tengo la cancha".',
    },
  }
  // Con un solo complejo el form lo preselecciona: dos para que quede sin elegir.
  const two = [TENANT, { ...TENANT, id: 't2', name: 'Open Door', slug: 'open-door' }]
  const renderEmpty = () =>
    render(
      <NewMatchForm
        tenants={two}
        bookings={[]}
        prefill={null}
        today="2026-03-14"
        nowTime="15:30"
        action={vi.fn(async () => EMPTY)}
      />,
    )

  it('un envío vacío muestra los tres errores a la vez, un solo alert y el foco en el primero', async () => {
    renderEmpty()
    await submit()
    expect(await screen.findByText('Elegí el complejo.')).toBeTruthy()
    expect(screen.getByText('Elegí la hora.')).toBeTruthy()
    expect(screen.getByText('Marcá "Ya tengo la cancha".')).toBeTruthy()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert').textContent).toBe('Elegí el complejo.')
    await waitFor(() => expect(document.activeElement?.id).toBe('rival-complejo'))
    expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true')
  })

  it('editar un campo limpia su error y deja el resto', async () => {
    renderEmpty()
    await submit()
    await screen.findByText('Elegí la hora.')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ya tengo la cancha' }))
    expect(screen.queryByText('Marcá "Ya tengo la cancha".')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: '20:00' }))
    expect(screen.queryByText('Elegí la hora.')).toBeNull()
    expect(screen.getByText('Elegí el complejo.')).toBeTruthy()
  })
})

describe('NewMatchForm — fallo de red', () => {
  it('si la action rechaza, dice que no se sabe si se armó y ofrece Mis partidos, sin perder lo cargado', async () => {
    const { container } = renderForm(
      vi.fn(async () => {
        throw new Error('fetch failed')
      }),
      false,
    )
    fireEvent.click(screen.getByRole('radio', { name: '21:00' }))
    await submit()
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos confirmar')
    expect(screen.getByRole('link', { name: 'Ver mis partidos' }).getAttribute('href')).toBe(
      '/rival/mis-partidos',
    )
    expect(hidden(container, 'time')).toBe('21:00')
  })

  it('con la sesión vencida ofrece ingresar', async () => {
    renderForm(
      vi.fn(async () => ({
        success: false,
        error: 'Ingresá a tu cuenta para seguir.',
        code: 'no_session',
      })),
      false,
    )
    await submit()
    expect((await screen.findByRole('alert')).textContent).toContain('Ingresá a tu cuenta')
    expect(screen.getByRole('link', { name: 'Ingresar' })).toBeTruthy()
  })
})

describe('NewMatchForm — qué armás', () => {
  it('"Mi equipo busca rival" saca el stepper, fija el cupo en el formato y lo manda en `mode`', async () => {
    const { container } = renderForm(async () => ({ success: true }), false)
    expect(screen.getByRole('status').textContent).toBe('10')
    expect(hidden(container, 'mode')).toBe('full')
    fireEvent.click(screen.getByRole('radio', { name: 'Mi equipo busca rival' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Uno más' })).toBeNull()
    expect(screen.getByText('Tu equipo: 5')).toBeTruthy()
    expect(hidden(container, 'mode')).toBe('rival')
    expect(hidden(container, 'capacity')).toBe('5')
  })

  it('el cupo se muestra como dato y el stepper abre solo con "Cambiar"', () => {
    renderForm(async () => ({ success: true }), false)
    expect(screen.queryByRole('button', { name: 'Uno más' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar cuántos juegan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Uno más' }))
    expect(screen.getByRole('status').textContent).toBe('11')
  })

  it('el form ya no pide nada del tablón', () => {
    renderForm(async () => ({ success: true }), false)
    expect(screen.queryByText('Tablón')).toBeNull()
    expect(screen.queryByLabelText('Tu WhatsApp')).toBeNull()
  })
})

describe('NewMatchForm — la hora', () => {
  it('muestra las cuatro rápidas; "Otra hora" abre la lista completa', () => {
    renderForm(async () => ({ success: true }), false)
    expect(
      ['19:00', '20:00', '21:00', '22:00'].map((t) => screen.getByRole('radio', { name: t })),
    ).toHaveLength(4)
    const other = screen.getByRole('button', { name: 'Otra hora' })
    expect(other.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(other)
    expect(other.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('button', { name: 'Elegí otra hora' })).toBeTruthy()
  })

  it('el horario del complejo saca las rápidas que no entran', () => {
    renderForm(async () => ({ success: true }), false, {
      ...TENANT,
      schedule: daily('17:00', '21:00'),
    })
    expect(screen.getByRole('radio', { name: '20:00' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: '21:00' })).toBeNull()
  })

  it('un día cerrado en el complejo avisa y deja elegir igual', () => {
    renderForm(async () => ({ success: true }), false, {
      ...TENANT,
      schedule: daily('10:00', '23:00', 'sat'),
    })
    expect(screen.getByText(/figura cerrado en TurnoGol/)).toBeTruthy()
    expect(screen.getByRole('radio', { name: '20:00' })).toBeTruthy()
  })

  it('pasadas las 23:30 el día arranca en mañana', () => {
    renderForm(async () => ({ success: true }), false, TENANT, '23:45')
    expect(screen.getByRole('radio', { name: 'Dom 15' }).getAttribute('data-state')).toBe('checked')
    fireEvent.click(screen.getByRole('radio', { name: /Hoy/ }))
    expect(screen.getByText('Hoy ya no quedan horarios. Elegí otro día.')).toBeTruthy()
  })

  it('una hora que dejó de valer no viaja escondida: se avisa y se vacía', () => {
    // Repetir un partido de hoy a las 15:00, con las 15:30 ya corridas.
    const { container } = render(
      <NewMatchForm
        tenants={[TENANT]}
        bookings={[]}
        prefill={null}
        repeat={{
          tenantId: 't1',
          date: '2026-03-14',
          time: '15:00',
          format: 5,
          capacity: 10,
          level: 'parejo',
        }}
        today="2026-03-14"
        nowTime="15:30"
        action={async () => ({ success: true })}
      />,
    )
    expect(hidden(container, 'time')).toBe('')
    expect(screen.getByText('Esa hora ya no está disponible. Elegí otra.')).toBeTruthy()
  })
})
