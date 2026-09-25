// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ADMIN_HEADER_SLOT_ID } from '@/components/layout/admin-header-slot'

const replaceMock = vi.fn()
let searchParamsInit = ''
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/reservas',
  useSearchParams: () => new URLSearchParams(searchParamsInit),
}))

import { ReservasHeaderBar } from '@/app/(admin)/reservas/ReservasHeaderBar'

const COURTS = [
  { id: 'c1', name: 'Cancha 1' },
  { id: 'c2', name: 'Cancha 2' },
]

function renderBar(overrides: Partial<React.ComponentProps<typeof ReservasHeaderBar>> = {}) {
  return render(
    <ReservasHeaderBar
      scope="proximos"
      status=""
      q=""
      cancha=""
      courts={COURTS}
      counts={{ confirmed: 3, pending_payment: 2, no_show: 1 }}
      {...overrides}
    />,
  )
}

/** Radix DropdownMenu abre con teclado (Enter); el pointerdown real de un mouse no se simula bien en happy-dom (mismo gotcha que staff-actions-role-menu.test.tsx). */
async function openCourtSelect() {
  const trigger = screen.getAllByLabelText('Filtrar por cancha')[0]!
  fireEvent.keyDown(trigger, { key: 'Enter' })
  await waitFor(() => screen.getByRole('menu'))
}

// `ReservasHeaderBar` renderiza el mismo contenido dos veces (slot `lg`+ y
// cuerpo `< lg`), oculto por CSS — no por un `if`. Sin CSS real en jsdom, las
// dos copias quedan "visibles" para testing-library: cada test toma la
// PRIMERA (`getAllByRole(...)[0]`), que alcanza para probar la lógica
// (comparten el mismo estado de React).
beforeEach(() => {
  const host = document.createElement('div')
  host.id = ADMIN_HEADER_SLOT_ID
  document.body.appendChild(host)
  vi.clearAllMocks()
  vi.useFakeTimers()
  searchParamsInit = ''
})
afterEach(() => {
  vi.useRealTimers()
  document.getElementById(ADMIN_HEADER_SLOT_ID)?.remove()
})

describe('ReservasHeaderBar — búsqueda URL-based', () => {
  it('debounce de 300ms: una sola navegación con el valor final', () => {
    renderBar()
    const input = screen.getAllByLabelText('Buscar por nombre, teléfono o número de reserva')[0]!

    fireEvent.change(input, { target: { value: 'ju' } })
    fireEvent.change(input, { target: { value: 'juan' } })
    expect(replaceMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/reservas?q=juan', { scroll: false })
  })

  it('preserva status y cancha existentes en la URL', () => {
    searchParamsInit = 'status=pending_payment&cancha=c1'
    renderBar({ status: 'pending_payment', cancha: 'c1' })
    fireEvent.change(
      screen.getAllByLabelText('Buscar por nombre, teléfono o número de reserva')[0]!,
      {
        target: { value: 'ana' },
      },
    )
    vi.advanceTimersByTime(300)
    expect(replaceMock).toHaveBeenCalledWith('/reservas?status=pending_payment&cancha=c1&q=ana', {
      scroll: false,
    })
  })

  it('arranca con el ?q de la URL y el botón limpiar lo borra sin debounce', () => {
    searchParamsInit = 'q=maria'
    renderBar({ q: 'maria' })
    const inputs = screen.getAllByLabelText<HTMLInputElement>(
      'Buscar por nombre, teléfono o número de reserva',
    )
    expect(inputs[0]!.value).toBe('maria')

    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar búsqueda' })[0]!)
    expect(inputs[0]!.value).toBe('')
    expect(replaceMock).toHaveBeenCalledWith('/reservas', { scroll: false })
  })
})

describe('ReservasHeaderBar — segmento Próximos/Pasados', () => {
  it('arma URLs compartibles preservando q y status', () => {
    renderBar({ q: 'juan', status: 'no_show' })
    const nav = screen.getAllByRole('navigation', { name: 'Rango' })[0]!
    expect(within(nav).getByRole('link', { name: 'Próximos' }).getAttribute('href')).toBe(
      '/reservas?status=no_show&q=juan',
    )
    expect(within(nav).getByRole('link', { name: 'Pasados' }).getAttribute('href')).toBe(
      '/reservas?dia=pasados&status=no_show&q=juan',
    )
  })
})

describe('ReservasHeaderBar — chips de estado', () => {
  it('cada chip muestra su contador, "Todos" sin número', () => {
    renderBar()
    const group = screen.getAllByRole('group', { name: 'Filtrar por estado' })[0]!
    expect(within(group).getByRole('button', { name: 'Todos' })).toBeTruthy()
    expect(within(group).getByRole('button', { name: 'Esperando seña (2)' })).toBeTruthy()
    expect(within(group).getByRole('button', { name: 'Ausentes (1)' })).toBeTruthy()
    expect(within(group).getByRole('button', { name: 'Cancelados (0)' })).toBeTruthy()
  })

  it('elegir un chip navega con router.replace y resetea pagina', () => {
    searchParamsInit = 'pagina=3'
    renderBar()
    const group = screen.getAllByRole('group', { name: 'Filtrar por estado' })[0]!
    fireEvent.click(within(group).getByRole('button', { name: 'Ausentes (1)' }))
    expect(replaceMock).toHaveBeenCalledWith('/reservas?status=no_show', { scroll: false })
  })

  it('volver a "Todos" saca el status', () => {
    renderBar({ status: 'no_show' })
    const group = screen.getAllByRole('group', { name: 'Filtrar por estado' })[0]!
    fireEvent.click(within(group).getByRole('button', { name: 'Todos' }))
    expect(replaceMock).toHaveBeenCalledWith('/reservas', { scroll: false })
  })
})

describe('ReservasHeaderBar — select de cancha', () => {
  it('elegir una cancha navega con router.replace y resetea pagina', async () => {
    // Timers reales: el `waitFor` de abajo (y el propio DropdownMenu de
    // Radix) usan sus propios timers internos, que fake timers deja
    // congelados — mismo gotcha que spyOn de timer con fake timers.
    vi.useRealTimers()
    searchParamsInit = 'pagina=3'
    renderBar()
    await openCourtSelect()
    const body = within(document.body)
    fireEvent.click(body.getByRole('menuitemradio', { name: 'Cancha 2' }))
    expect(replaceMock).toHaveBeenCalledWith('/reservas?cancha=c2', { scroll: false })
  })

  it('con una sola cancha, no hay select', () => {
    renderBar({ courts: [COURTS[0]!] })
    expect(screen.queryByLabelText('Filtrar por cancha')).toBeNull()
  })
})
