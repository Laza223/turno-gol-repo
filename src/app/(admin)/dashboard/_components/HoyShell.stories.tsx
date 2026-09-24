import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import type { BoardBooking } from '@/lib/dashboard/today-board'
import type { HoyCourt } from './HoyChargeModal'
import { HoyShell } from './HoyShell'

/**
 * El tablero de Hoy con su modal: lo que se prueba acá es que las dos piezas
 * viven juntas. Una fila abre el modal; el modal se cierra solo si el turno
 * desaparece de la lista (se canceló, se pasó a otro día) — sin dejar un
 * diálogo mostrando un turno fantasma — y sigue abierto si el turno se termina
 * de pagar y sale del tablero.
 *
 * Reloj FIJO: viernes 18/09/2026, 21:05 en Argentina (UTC-3).
 */
const DAY = '2026-09-18'
const art = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return Date.parse(`${DAY}T00:00:00Z`) + ((h ?? 0) + 3) * 3_600_000 + (m ?? 0) * 60_000
}
const NOW_MS = art('21:05')

const COURTS: HoyCourt[] = [
  {
    id: 'c1',
    name: 'Cancha 1',
    status: 'online',
    capacity: 10,
    pricing: { rules: [] } as unknown as HoyCourt['pricing'],
  },
]

function turno(over: Partial<BoardBooking> & { id: string }): BoardBooking {
  return {
    courtId: 'c1',
    date: DAY,
    timeStart: '20:00',
    timeEnd: '21:00',
    startsAtMs: art('20:00'),
    endsAtMs: art('21:00'),
    status: 'confirmed',
    type: 'spontaneous',
    guestName: null,
    playerFirstName: 'Lucía',
    playerLastName: 'Méndez',
    priceSnapshot: 6_000_000,
    depositStatus: 'not_required',
    depositAmount: 0,
    totalPaid: 0,
    pending: 6_000_000,
    ...over,
  } as BoardBooking
}

const ok = () => fn(async () => ({ success: true as const }))

type Controller = { current: { replace: (next: BoardBooking[]) => void } | null }

function Harness({
  initial,
  controllerRef,
}: {
  initial: BoardBooking[]
  controllerRef: Controller
}) {
  const [bookings, setBookings] = useState(initial)
  // Hace de `router.refresh()`: la pantalla real recibe una lista nueva por props.
  useEffect(() => {
    controllerRef.current = { replace: setBookings }
  }, [controllerRef])

  return (
    <HoyShell
      bookings={bookings}
      courts={COURTS}
      daySlots={[]}
      occupancy={{ occupied: 2, available: 14, blocked: 0, pct: 14 }}
      dayIsClosed={false}
      canManageCourts
      serverNowMs={NOW_MS}
      cancellationPolicyHours={24}
      actions={{
        chargeDebtAction: ok(),
        completeAndChargeBookingAction: ok(),
        addBookingChargeAction: ok(),
        markNoShowAction: ok(),
        revertNoShowAction: ok(),
        cancelBookingAction: ok(),
      }}
      canteen={{
        listCatalogAction: fn(async () => ({ success: true as const, products: [] })),
        sellTicketAction: fn(async () => ({ success: true as const })) as never,
      }}
    />
  )
}

const meta = {
  title: 'Admin/Dashboard/HoyShell',
  component: Harness,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

const LISTA = [
  turno({ id: 'lucia' }),
  turno({
    id: 'pablo',
    timeStart: '19:00',
    timeEnd: '20:00',
    startsAtMs: art('19:00'),
    endsAtMs: art('20:00'),
    playerFirstName: 'Pablo',
    playerLastName: 'Ruiz',
  }),
]

async function openDialog() {
  const element = await screen.findByRole('dialog')
  // Entra con una animación de opacidad: se espera a que termine.
  await waitFor(() => expect(element).toBeVisible())
  return within(element)
}

/** Una fila abre el modal del turno en la misma pantalla, sin navegar. */
export const UnaFilaAbreElModal: Story = {
  args: { initial: LISTA, controllerRef: { current: null } },
  play: async ({ canvasElement }) => {
    const board = within(canvasElement)
    await userEvent.click(board.getByRole('button', { name: /Lucía Méndez/ }))
    const dialog = await openDialog()
    await expect(dialog.getByText('Lucía Méndez')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/** Si el turno abierto ya no está en la lista, el modal se cierra solo. */
export const SeCierraSiElTurnoDesaparece: Story = {
  args: { initial: LISTA, controllerRef: { current: null } },
  play: async ({ canvasElement, args }) => {
    const board = within(canvasElement)
    await userEvent.click(board.getByRole('button', { name: /Lucía Méndez/ }))
    await openDialog()

    // Llega una lista sin ese turno (por ejemplo, se canceló desde otro puesto).
    args.controllerRef.current?.replace(LISTA.filter((b) => b.id !== 'lucia'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  },
}

/**
 * Un turno que se termina de pagar sale del tablero, pero el modal NO se cierra:
 * tiene que poder mostrar "Cobrado ✓" y ofrecer "Listo".
 */
export const UnTurnoPagadoSaleDelTableroPeroElModalSigue: Story = {
  args: { initial: LISTA, controllerRef: { current: null } },
  play: async ({ canvasElement, args }) => {
    const board = within(canvasElement)
    await userEvent.click(board.getByRole('button', { name: /Lucía Méndez/ }))
    const dialog = await openDialog()

    args.controllerRef.current?.replace(
      LISTA.map((b) =>
        b.id === 'lucia' ? { ...b, status: 'completed', totalPaid: 6_000_000, pending: 0 } : b,
      ),
    )
    await waitFor(() => expect(dialog.getByText('Cobrado ✓')).toBeVisible())
    // Y ya no figura como turno sin cobrar en el tablero de atrás. Con el modal
    // abierto lo de atrás queda aria-hidden, así que se busca por texto y no por rol.
    await expect(within(canvasElement).queryByText(/Lucía Méndez/)).toBeNull()
  },
}
