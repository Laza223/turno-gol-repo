import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import type { BoardBooking } from '@/lib/dashboard/today-board'
import { CobrarVariosDialog } from './CobrarVariosDialog'
import type { HoyCourt } from './HoyChargeModal'

/**
 * "Cobrar varios": las tarjetas de los turnos en rojo. Lo que se asevera es el
 * comportamiento donde hay plata: cada tarjeta cobra SU turno con SU monto, una
 * que se cobra no apaga ni mueve a las otras, y la cobrada se queda en su lugar.
 *
 * El "Harness" hace de servidor: aplica lo que cobran las acciones y, al
 * refrescar, devuelve los turnos con el saldo nuevo — igual que `router.refresh()`.
 * Reloj FIJO (viernes 18/09/2026, 22:30 ART).
 */
const DAY = '2026-09-18'
const art = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return Date.parse(`${DAY}T00:00:00Z`) + ((h ?? 0) + 3) * 3_600_000 + (m ?? 0) * 60_000
}
const NOW_MS = art('22:30')
const REFRESH_MS = 30
const NAMES = [
  'Juan',
  'Marcos',
  'Lucía',
  'Diego',
  'Sofía',
  'Tomás',
  'Ana',
  'Pablo',
  'Romina',
  'Iván',
]

const COURTS: HoyCourt[] = Array.from({ length: 10 }, (_, i) => ({
  id: `c${i + 1}`,
  name: `Cancha ${i + 1}`,
  status: 'online' as const,
  capacity: 10,
  pricing: { rules: [] } as unknown as HoyCourt['pricing'],
}))

/** El turno de la cancha `n`: $60.000, terminó hace un rato, sin nada cobrado. */
function turno(n: number, over: Partial<BoardBooking> = {}): BoardBooking {
  return {
    id: `b${n}`,
    courtId: `c${n}`,
    date: DAY,
    timeStart: '20:00',
    timeEnd: '21:00',
    startsAtMs: art('20:00'),
    endsAtMs: art('21:00'),
    status: 'confirmed',
    type: 'spontaneous',
    guestName: NAMES[n - 1] ?? `Cliente ${n}`,
    playerFirstName: null,
    playerLastName: null,
    priceSnapshot: 6_000_000,
    depositStatus: 'not_required',
    depositAmount: 0,
    totalPaid: 0,
    pending: 6_000_000,
    ...over,
  } as BoardBooking
}

const rojos = (count: number) => Array.from({ length: count }, (_, i) => turno(i + 1))

type Charged = Record<string, number>

type MockedActions = SlotPanelActions & {
  chargeDebtAction: ReturnType<typeof fn>
  completeAndChargeBookingAction: ReturnType<typeof fn>
}

function makeActions(charged: Charged): MockedActions {
  const collect = async (input: {
    bookingId: string
    charges: { amount: number; method: string }[]
  }) => {
    for (const c of input.charges)
      charged[input.bookingId] = (charged[input.bookingId] ?? 0) + c.amount
    return { success: true as const }
  }
  return {
    chargeDebtAction: fn(collect),
    completeAndChargeBookingAction: fn(collect),
    addBookingChargeAction: fn(collect),
  } as unknown as MockedActions
}

type HarnessProps = {
  initial: BoardBooking[]
  actions: MockedActions
  charged: Charged
  onClose: () => void
  onOpenBooking: (id: string) => void
}

function Harness({ initial, actions, charged, onClose, onOpenBooking }: HarnessProps) {
  const [bookings, setBookings] = useState(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onMutated() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const paid = { ...charged }
      for (const key of Object.keys(charged)) delete charged[key]
      setBookings((all) =>
        all.map((b) => {
          const amount = paid[b.id]
          if (!amount) return b
          return {
            ...b,
            totalPaid: (b.totalPaid ?? 0) + amount,
            pending: Math.max(0, (b.pending ?? 0) - amount),
            status: b.status === 'confirmed' ? 'completed' : b.status,
          }
        }),
      )
    }, REFRESH_MS)
  }

  return (
    <CobrarVariosDialog
      bookings={bookings}
      courts={COURTS}
      nowMs={NOW_MS}
      actions={actions}
      onMutated={onMutated}
      onOpenBooking={onOpenBooking}
      onClose={onClose}
    />
  )
}

const meta = {
  title: 'Admin/Dashboard/CobrarVariosDialog',
  component: Harness,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

async function openDialog() {
  const element = await screen.findByRole('dialog')
  await waitFor(() => expect(element).toBeVisible())
  return within(element)
}

function scenario(initial: BoardBooking[]): HarnessProps {
  const charged: Charged = {}
  return {
    initial,
    charged,
    actions: makeActions(charged),
    onClose: fn(),
    onOpenBooking: fn(),
  }
}

const card = (dialog: ReturnType<typeof within>, name: string) =>
  within(dialog.getByRole('group', { name: new RegExp(name) }))

/** Dos turnos: cada tarjeta cobra lo suyo y la otra sigue disponible. */
export const DosTarjetas: Story = {
  args: scenario(rojos(2)),
  play: async ({ args }) => {
    const dialog = await openDialog()
    await expect(dialog.getByText(/Faltan cobrar 2 turnos · \$\s120\.000/)).toBeVisible()

    // "Pagó uno" de la primera: 1/10 de $60.000, en efectivo.
    await userEvent.click(
      card(dialog, 'Juan').getByRole('button', { name: /Pagó uno · \$\s6\.000/ }),
    )
    await waitFor(() =>
      expect(args.actions.completeAndChargeBookingAction).toHaveBeenCalledTimes(1),
    )
    await expect(args.actions.completeAndChargeBookingAction).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'b1', charges: [{ amount: 600_000, method: 'cash' }] }),
    )

    // Mientras la primera espera sus datos nuevos, la segunda NO se apaga.
    await expect(
      card(dialog, 'Marcos').getByRole('button', { name: /^Cobrar \$\s60\.000/ }),
    ).toBeEnabled()

    // Cobrar todo de la segunda con MercadoPago.
    await userEvent.click(card(dialog, 'Marcos').getByRole('radio', { name: 'MercadoPago' }))
    await userEvent.click(
      card(dialog, 'Marcos').getByRole('button', { name: /^Cobrar \$\s60\.000/ }),
    )
    await waitFor(() =>
      expect(args.actions.completeAndChargeBookingAction).toHaveBeenCalledTimes(2),
    )
    await expect(args.actions.completeAndChargeBookingAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bookingId: 'b2',
        charges: [{ amount: 6_000_000, method: 'mercadopago' }],
      }),
    )
    // La cobrada se queda en su lugar, ahora como "Cobrado ✓".
    await waitFor(() => expect(card(dialog, 'Marcos').getByText('Cobrado ✓')).toBeVisible())
    await expect(args.onClose).not.toHaveBeenCalled()
  },
}

export const CincoTarjetas: Story = { args: scenario(rojos(5)) }

export const DiezTarjetas: Story = { args: scenario(rojos(10)) }

/** Una a medias: ya pagaron 4 de 10, la nota lo dice y "Pagó uno" sigue ofrecido. */
export const UnaAMedias: Story = {
  args: scenario([turno(1, { totalPaid: 2_400_000, pending: 3_600_000 }), turno(2), turno(3)]),
  play: async () => {
    const dialog = await openDialog()
    await expect(card(dialog, 'Juan').getByText('Pagaron 4 de 10')).toBeVisible()
    await expect(card(dialog, 'Juan').getByText(/Falta \$\s36\.000/)).toBeVisible()
  },
}

/**
 * Una que se cobra con el diálogo abierto: se queda en su lugar con "Cobrado ✓",
 * sin botones de cobro, y las otras no se mueven.
 */
export const UnaCobrada: Story = {
  args: scenario(rojos(3)),
  play: async ({ args }) => {
    const dialog = await openDialog()
    await userEvent.click(
      card(dialog, 'Marcos').getByRole('button', { name: /^Cobrar \$\s60\.000/ }),
    )
    await waitFor(() => expect(card(dialog, 'Marcos').getByText('Cobrado ✓')).toBeVisible())
    await expect(card(dialog, 'Marcos').queryByRole('button', { name: /^Cobrar/ })).toBeNull()
    await expect(args.onClose).not.toHaveBeenCalled()
    const names = dialog.getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    await expect(names).toEqual(['Juan, Cancha 1', 'Marcos, Cancha 2', 'Lucía, Cancha 3'])
  },
}

/** "Otro monto": más que lo que falta se rechaza en la tarjeta y no llama al servidor. */
export const OtroMontoMayorQueLoQueFalta: Story = {
  args: scenario(rojos(2)),
  play: async ({ args }) => {
    const dialog = await openDialog()
    await userEvent.click(card(dialog, 'Juan').getByRole('button', { name: 'Otro monto' }))
    await userEvent.type(card(dialog, 'Juan').getByLabelText(/Otro monto para Juan/), '70000')
    await userEvent.click(card(dialog, 'Juan').getByRole('button', { name: /^Cobrar \$\s70\.000/ }))
    await expect(card(dialog, 'Juan').getByRole('alert')).toHaveTextContent(/supera lo que falta/)
    await expect(args.actions.completeAndChargeBookingAction).not.toHaveBeenCalled()
  },
}

/** En el teléfono: una columna. */
export const Telefono: Story = {
  args: scenario(rojos(3)),
  parameters: { viewport: { defaultViewport: 'mobile-primary' } },
}
