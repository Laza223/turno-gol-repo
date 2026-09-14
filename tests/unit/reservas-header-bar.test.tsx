// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
      scope="hoy"
      status=""
      q=""
      cancha=""
      courts={COURTS}
      counts={{ confirmed: 3 }}
      total={3}
      {...overrides}
    />,
  )
}

// `ReservasHeaderBar` portea la mitad de su contenido al hueco de la barra
// superior (`AdminHeaderSlot`, MASTER §6.8). Sin ese nodo en el documento el
// portal no renderiza nada — mismo patrón que `caja-tabs.test.tsx` — así que
// el test lo monta igual que hace el armazón del panel.
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

/**
 * `ReservasHeaderBar` renderiza el mismo contenido dos veces (slot `lg`+ y
 * cuerpo `< lg`), oculto por CSS — no por un `if`. Sin CSS real en jsdom, las
 * dos copias quedan "visibles" para testing-library: cada test toma la
 * PRIMERA (`getAllByRole(...)[0]`), que alcanza para probar la lógica
 * (comparten el mismo estado de React).
 */
describe('ReservasHeaderBar — búsqueda URL-based', () => {
  it('debounce de 300ms: una sola navegación con el valor final', () => {
    renderBar()
    const input = screen.getAllByLabelText('Buscar por nombre o número de reserva')[0]!

    fireEvent.change(input, { target: { value: 'ju' } })
    fireEvent.change(input, { target: { value: 'juan' } })
    expect(replaceMock).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/reservas?q=juan', { scroll: false })
  })

  it('preserva status y cancha existentes en la URL', () => {
    searchParamsInit = 'status=confirmed&cancha=c1'
    renderBar({ status: 'confirmed', cancha: 'c1' })
    fireEvent.change(screen.getAllByLabelText('Buscar por nombre o número de reserva')[0]!, {
      target: { value: 'ana' },
    })
    vi.advanceTimersByTime(300)
    expect(replaceMock).toHaveBeenCalledWith('/reservas?status=confirmed&cancha=c1&q=ana', {
      scroll: false,
    })
  })

  it('arranca con el ?q de la URL y el botón limpiar lo borra sin debounce', () => {
    searchParamsInit = 'q=maria'
    renderBar({ q: 'maria' })
    const inputs = screen.getAllByLabelText<HTMLInputElement>(
      'Buscar por nombre o número de reserva',
    )
    expect(inputs[0]!.value).toBe('maria')

    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar búsqueda' })[0]!)
    expect(inputs[0]!.value).toBe('')
    expect(replaceMock).toHaveBeenCalledWith('/reservas', { scroll: false })
  })
})

describe('ReservasHeaderBar — popover de filtros', () => {
  it('el trigger muestra badge con la cantidad de filtros activos', () => {
    renderBar({ status: 'confirmed', cancha: 'c1' })
    const trigger = screen.getAllByRole('button', { name: /Filtros/ })[0]!
    expect(trigger.textContent).toContain('2')
  })

  it('sin filtros activos, sin badge ni "Limpiar filtros"', () => {
    renderBar()
    fireEvent.click(screen.getAllByRole('button', { name: /Filtros/ })[0]!)
    const popover = within(document.body)
    expect(popover.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull()
  })

  it('elegir una cancha navega con router.replace y resetea pagina', () => {
    searchParamsInit = 'pagina=3'
    renderBar()
    fireEvent.click(screen.getAllByRole('button', { name: /Filtros/ })[0]!)
    const popover = within(document.body)
    fireEvent.click(popover.getByRole('radio', { name: 'Cancha 2' }))
    expect(replaceMock).toHaveBeenCalledWith('/reservas?cancha=c2', { scroll: false })
  })

  it('con una sola cancha, no hay fieldset de Cancha', () => {
    renderBar({ courts: [COURTS[0]!] })
    fireEvent.click(screen.getAllByRole('button', { name: /Filtros/ })[0]!)
    const popover = within(document.body)
    expect(popover.queryByText('Cancha')).toBeNull()
  })

  it('"Limpiar filtros" saca status y cancha', () => {
    renderBar({ status: 'confirmed', cancha: 'c1' })
    fireEvent.click(screen.getAllByRole('button', { name: /Filtros/ })[0]!)
    const popover = within(document.body)
    fireEvent.click(popover.getByRole('button', { name: 'Limpiar filtros' }))
    expect(replaceMock).toHaveBeenCalledWith('/reservas', { scroll: false })
  })
})

describe('ReservasHeaderBar — contador de reservas', () => {
  it('el total muestra "N reservas"', () => {
    renderBar({ total: 12 })
    expect(screen.getByText('12 reservas')).toBeTruthy()
  })

  it('en singular con 1 reserva', () => {
    renderBar({ total: 1 })
    expect(screen.getByText('1 reserva')).toBeTruthy()
  })
})
