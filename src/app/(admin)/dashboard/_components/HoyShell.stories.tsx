import { useEffect, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import type { EarlierBooking } from '@/components/dashboard/CourtBoard'
import type { BoardBooking } from '@/lib/dashboard/today-board'
import type { HoyCourt } from './HoyChargeModal'
import { HoyShell } from './HoyShell'

/**
 * La cola de Hoy con su modal: lo que se prueba acá es que las dos piezas
 * viven juntas. Una fila abre el modal; el modal se cierra solo si el turno
 * desaparece de la lista (se canceló, se pasó a otro día) — sin dejar un
 * diálogo mostrando un turno fantasma — y sigue abierto si el turno se termina
 * de pagar y sale de la cola, ofreciendo el siguiente para cobrar.
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

type Controller = {
  current: {
    replace: (next: BoardBooking[]) => void
    replaceEarlier: (next: EarlierBooking[]) => void
  } | null
}

function Harness({
  initial,
  initialEarlier = [],
  controllerRef,
}: {
  initial: BoardBooking[]
  initialEarlier?: EarlierBooking[]
  controllerRef: Controller
}) {
  const [bookings, setBookings] = useState(initial)
  const [earlier, setEarlier] = useState(initialEarlier)
  // Hace de `router.refresh()`: la pantalla real recibe listas nuevas por props.
  useEffect(() => {
    controllerRef.current = { replace: setBookings, replaceEarlier: setEarlier }
  }, [controllerRef])

  return (
    <HoyShell
      bookings={bookings}
      earlier={{
        bookings: earlier,
        count: earlier.length,
        pendingCents: earlier.reduce((sum, b) => sum + (b.pending ?? 0), 0),
      }}
      courts={COURTS}
      daySlots={[]}
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

/** En Hoy el modal es solo para cobrar: ni cantina ni "Marcar ausente". */
export const ElModalDeHoySoloCobra: Story = {
  args: { initial: LISTA, controllerRef: { current: null } },
  play: async ({ canvasElement }) => {
    const board = within(canvasElement)
    await userEvent.click(board.getByRole('button', { name: /Lucía Méndez/ }))
    const dialog = await openDialog()
    await expect(dialog.getByRole('button', { name: /Cobrar \$/ })).toBeVisible()
    await expect(dialog.queryByRole('button', { name: /Cantina/ })).toBeNull()
    await expect(dialog.queryByRole('button', { name: /Marcar ausente/ })).toBeNull()
  },
}

/**
 * Un turno que se termina de pagar sale de la cola, pero el modal NO se cierra:
 * muestra "Cobrado ✓" y ofrece cobrar el siguiente sin volver a la lista.
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
    // Y ya no figura en la cola de atrás. Con el modal abierto lo de atrás queda
    // aria-hidden, así que se busca por texto y no por rol.
    await expect(within(canvasElement).queryByText(/Lucía Méndez/)).toBeNull()

    // El siguiente de la cola, a un toque: el modal pasa a Pablo sin cerrarse.
    await userEvent.click(dialog.getByRole('button', { name: /Cobrar el siguiente: Pablo Ruiz/ }))
    await waitFor(() => expect(dialog.getByText('Pablo Ruiz')).toBeVisible())
    await expect(dialog.getByRole('button', { name: /Cobrar \$/ })).toBeVisible()
  },
}

const AYER: EarlierBooking = {
  ...turno({
    id: 'ayer',
    date: '2026-09-17',
    startsAtMs: art('20:00') - 86_400_000,
    endsAtMs: art('21:00') - 86_400_000,
    status: 'completed',
    playerFirstName: 'Martín',
    playerLastName: 'Díaz',
  }),
  dayLabel: 'ayer',
}

/**
 * Un turno de un día anterior sale de su lista cuando se termina de pagar (la
 * lista solo trae los que deben): el modal lo muestra saldado en vez de cerrarse.
 */
export const UnTurnoDeAyerPagadoMuestraCobrado: Story = {
  args: { initial: [], initialEarlier: [AYER], controllerRef: { current: null } },
  play: async ({ canvasElement, args }) => {
    const board = within(canvasElement)
    // Un renglón con el total; la lista se abre aparte y de ahí, el modal de cobro.
    await userEvent.click(board.getByRole('button', { name: /1 turno no cobrado/ }))
    const list = within(await within(document.body).findByRole('dialog'))
    await userEvent.click(list.getByRole('button', { name: /Martín Díaz/ }))
    const dialog = within(await screen.findByRole('dialog', { name: /Martín Díaz/ }))

    args.controllerRef.current?.replaceEarlier([])
    await waitFor(() => expect(dialog.getByText('Cobrado ✓')).toBeVisible())
  },
}
