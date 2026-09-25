import { useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import type { SlotPanelActions } from '@/components/booking/slot-panel/actions'
import type { BoardBooking } from '@/lib/dashboard/today-board'
import { HoyChargeModal, type HoyCourt } from './HoyChargeModal'

/**
 * El modal de cobro de Hoy. El punto de estas stories no es el aspecto sino el
 * comportamiento, que es donde está el riesgo (plata):
 *  - cada forma de cobrar (todo junto, por equipo, por jugador) llama a la
 *    acción correcta con el monto correcto;
 *  - el modal SE QUEDA ABIERTO después de cobrar y muestra el saldo nuevo;
 *  - dos cobros seguidos nunca viajan con la misma clave de idempotencia;
 *  - mientras los datos se refrescan, los controles de cobro están apagados.
 *
 * El "Harness" hace de servidor: aplica lo que cobran las acciones y, al
 * refrescar, devuelve el turno con el saldo nuevo — igual que `router.refresh()`.
 *
 * Reloj FIJO (viernes 18/09/2026, 21:05 ART): "Terminó hace 5 min" es parte de
 * lo que se asevera.
 */
const DAY = '2026-09-18'
const art = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return Date.parse(`${DAY}T00:00:00Z`) + ((h ?? 0) + 3) * 3_600_000 + (m ?? 0) * 60_000
}
const NOW_MS = art('21:05')

/** Cuánto tarda el refresco simulado: lo justo para ver el estado "bloqueado". */
const REFRESH_MS = 30

const COURTS: HoyCourt[] = [
  {
    id: 'c1',
    name: 'Cancha 1',
    status: 'online',
    capacity: 10,
    pricing: { rules: [] } as unknown as HoyCourt['pricing'],
  },
]

/** $60.000, terminó hace 5 minutos, sin nada cobrado: el caso del mostrador. */
function terminado(over: Partial<BoardBooking> = {}): BoardBooking {
  return {
    id: 'b1',
    courtId: 'c1',
    date: DAY,
    timeStart: '20:00',
    timeEnd: '21:00',
    startsAtMs: art('20:00'),
    endsAtMs: art('21:00'),
    status: 'confirmed',
    type: 'spontaneous',
    guestName: null,
    playerFirstName: 'Juan',
    playerLastName: 'Pérez',
    priceSnapshot: 6_000_000,
    depositStatus: 'not_required',
    depositAmount: 0,
    totalPaid: 0,
    pending: 6_000_000,
    ...over,
  } as BoardBooking
}

/** El mismo turno pero todavía en juego: cobrar es un adelanto, no da por jugado. */
function enJuego(over: Partial<BoardBooking> = {}): BoardBooking {
  return terminado({
    timeStart: '21:00',
    timeEnd: '22:00',
    startsAtMs: art('21:00'),
    endsAtMs: art('22:00'),
    ...over,
  })
}

type Charged = { amount: number; method: string; team?: 1 | 2 }[]

/** Lo cobrado que el refresco simulado todavía no aplicó, en total y por equipo. */
type Pending = { current: number; team1: number; team2: number }

type MockedActions = SlotPanelActions & {
  chargeDebtAction: ReturnType<typeof fn>
  completeAndChargeBookingAction: ReturnType<typeof fn>
  addBookingChargeAction: ReturnType<typeof fn>
}

/**
 * Cada acción de cobro es un `fn` real (se puede aseverar cuántas veces y con
 * qué) que además anota la plata para que el refresco simulado la aplique.
 */
function makeActions(charged: Pending, fail?: string, networkError = false): MockedActions {
  const collect = async (input: { charges: Charged }) => {
    // Se corta la conexión: el cobro pudo haber entrado o no, y no se sabe cuál.
    if (networkError) throw new Error('Failed to fetch')
    if (fail) return { success: false as const, error: fail }
    for (const c of input.charges) {
      charged.current += c.amount
      if (c.team === 1) charged.team1 += c.amount
      if (c.team === 2) charged.team2 += c.amount
    }
    return { success: true as const }
  }
  return {
    chargeDebtAction: fn(collect),
    completeAndChargeBookingAction: fn(collect),
    addBookingChargeAction: fn(collect),
    markNoShowAction: fn(async () => ({ success: true as const })),
    revertNoShowAction: fn(async () => ({ success: true as const })),
    cancelBookingAction: fn(async () => ({ success: true as const })),
    listRescheduleSlotsAction: fn(async () => ({
      success: true as const,
      slots: [],
      minDate: DAY,
      maxDate: DAY,
    })),
    rescheduleBookingAction: fn(async () => ({ success: true })),
    releaseBlockAction: fn(async () => ({ success: true as const })),
    confirmDepositPaymentAction: fn(async () => ({ success: true as const })),
    editBookingAction: fn(async () => ({ success: true as const })),
    getBookingEditDetailAction: fn(async () => ({
      success: true as const,
      guestPhone: null,
      createdByStaff: null,
    })),
  }
}

type HarnessProps = {
  initial: BoardBooking
  actions: MockedActions
  /** Plata que las acciones cobraron y el refresco simulado todavía no aplicó. */
  charged: Pending
  onClose: () => void
  /** Se llama cada vez que el modal pide refrescar la pantalla. */
  onRefresh: () => void
  forceRefreshing?: boolean
}

function Harness({
  initial,
  actions,
  charged,
  onClose,
  onRefresh,
  forceRefreshing = false,
}: HarnessProps) {
  const [booking, setBooking] = useState(initial)
  const [refreshing, setRefreshing] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Lo que hace `router.refresh()` en la pantalla real: un rato después llega el
  // turno con el saldo nuevo, y en ese rato `isRefreshing` está prendido.
  function onMutated() {
    onRefresh()
    setRefreshing(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // Se lee y se vacía ANTES del updater: React puede correr un updater dos veces,
      // y adentro tiene que ser puro.
      const paid = { ...charged }
      charged.current = 0
      charged.team1 = 0
      charged.team2 = 0
      setBooking((b) => {
        const pending = Math.max(0, (b.pending ?? 0) - paid.current)
        const totalPaid = (b.totalPaid ?? 0) + paid.current
        // El servidor suma aparte lo cobrado a cada equipo (`booking_team`).
        const team1Paid = (b.team1Paid ?? 0) + paid.team1
        const team2Paid = (b.team2Paid ?? 0) + paid.team2
        return {
          ...b,
          totalPaid,
          pending,
          team1Paid,
          team2Paid,
          // Cobrar un turno terminado lo da por jugado, como el servidor.
          status: b.status === 'confirmed' && b.endsAtMs <= NOW_MS ? 'completed' : b.status,
        }
      })
      setRefreshing(false)
    }, REFRESH_MS)
  }

  return (
    <HoyChargeModal
      booking={booking}
      courtName="Cancha 1"
      courts={COURTS}
      dayBookings={[booking]}
      daySlots={[]}
      nowMs={NOW_MS}
      isRefreshing={refreshing || forceRefreshing}
      actions={actions}
      renderCanteenDialog={({ open }) => (open ? <p>[diálogo de cantina]</p> : null)}
      onClose={onClose}
      onMutated={onMutated}
    />
  )
}

const meta = {
  title: 'Admin/Dashboard/HoyChargeModal',
  component: Harness,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Harness>

export default meta
type Story = StoryObj<typeof meta>

/**
 * El diálogo. Entra con una animación de opacidad (`fade-in`): mientras dura,
 * `toBeVisible` falla sobre todo lo que tiene adentro, así que se espera a que
 * termine antes de aseverar nada.
 */
async function openDialog() {
  const element = await screen.findByRole('dialog')
  await waitFor(() => expect(element).toBeVisible())
  return within(element)
}

/** Arma los args de una story: el turno, acciones espía nuevas y el cierre espía. */
function scenario(
  initial: BoardBooking,
  opts: { fail?: string; forceRefreshing?: boolean; networkError?: boolean } = {},
): HarnessProps {
  const charged = { current: 0, team1: 0, team2: 0 }
  return {
    initial,
    charged,
    actions: makeActions(charged, opts.fail, opts.networkError),
    onClose: fn(),
    onRefresh: fn(),
    forceRefreshing: opts.forceRefreshing,
  }
}

/**
 * Cobra "todo junto" sobre un turno que terminó: da por jugado y cobra. Después
 * de cobrar el modal SIGUE ABIERTO y dice "Cobrado ✓"; "Listo" lo cierra.
 */
export const TodoJuntoQuedaAbiertoYSeCierraConListo: Story = {
  args: scenario(terminado()),
  play: async ({ args }) => {
    const dialog = await openDialog()
    await expect(dialog.getByText('Juan Pérez')).toBeVisible()
    await expect(dialog.getByText(/Terminó hace 5 min/)).toBeVisible()
    await expect(dialog.getByText('Falta cobrar')).toBeVisible()

    await userEvent.click(
      dialog.getByRole('button', { name: /Cobrar \$\s60\.000 y dar por jugado/ }),
    )
    await waitFor(() =>
      expect(args.actions.completeAndChargeBookingAction).toHaveBeenCalledTimes(1),
    )
    await expect(args.actions.completeAndChargeBookingAction).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: 'b1',
        charges: [{ amount: 6_000_000, method: 'cash' }],
      }),
    )

    // Sigue abierto, y ahora dice que está cobrado.
    await waitFor(() => expect(dialog.getByText('Cobrado ✓')).toBeVisible())
    await expect(args.onClose).not.toHaveBeenCalled()
    await userEvent.click(dialog.getByRole('button', { name: 'Listo' }))
    await expect(args.onClose).toHaveBeenCalledTimes(1)
  },
}

/**
 * Por equipo: los dos equipos lado a lado, cada uno con su "Cobrar". Cada cobro
 * viaja con su equipo. Tras el primero, el Equipo 1 queda "Pagó" y el segundo
 * sigue esperando; como el turno ya quedó jugado, el segundo cobro va por la
 * acción de saldo (`settle`), no por la de terminar.
 */
export const PorEquipo: Story = {
  args: scenario(terminado()),
  play: async ({ args }) => {
    const dialog = await openDialog()
    await userEvent.click(dialog.getByRole('radio', { name: 'Por equipo' }))
    const team1 = within(dialog.getByRole('group', { name: 'Equipo 1' }))
    const team2 = within(dialog.getByRole('group', { name: 'Equipo 2' }))
    await expect(
      team1.getByRole('button', { name: /Cobrar \$\s30\.000 al Equipo 1/ }),
    ).toBeVisible()
    await expect(
      team2.getByRole('button', { name: /Cobrar \$\s30\.000 al Equipo 2/ }),
    ).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: /Cobrar .* al Equipo 1/ }))
    await waitFor(() =>
      expect(args.actions.completeAndChargeBookingAction).toHaveBeenCalledTimes(1),
    )
    await expect(args.actions.completeAndChargeBookingAction).toHaveBeenCalledWith(
      expect.objectContaining({ charges: [{ amount: 3_000_000, method: 'cash', team: 1 }] }),
    )
    await waitFor(() =>
      expect(
        within(dialog.getByRole('group', { name: 'Equipo 1' })).getByText('Pagó'),
      ).toBeVisible(),
    )
    await expect(dialog.queryByRole('button', { name: /Cobrar .* al Equipo 1/ })).toBeNull()

    await userEvent.click(dialog.getByRole('button', { name: /Cobrar .* al Equipo 2/ }))
    await waitFor(() => expect(args.actions.chargeDebtAction).toHaveBeenCalledTimes(1))
    await expect(args.actions.chargeDebtAction).toHaveBeenCalledWith(
      expect.objectContaining({ charges: [{ amount: 3_000_000, method: 'cash', team: 2 }] }),
    )
    await waitFor(() => expect(dialog.getByText('Cobrado ✓')).toBeVisible())
  },
}

/**
 * El caso del dueño del piloto: paga primero UNO del Equipo 2. Se le descuenta al
 * Equipo 2 y no al total: el Equipo 1 sigue debiendo su mitad entera.
 */
export const PagaPrimeroUnoDelEquipo2: Story = {
  args: scenario(terminado()),
  play: async ({ args }) => {
    const dialog = await openDialog()
    await userEvent.click(dialog.getByRole('radio', { name: 'Por equipo' }))

    await userEvent.click(dialog.getByRole('button', { name: /Pagó uno del Equipo 2/ }))
    await waitFor(() =>
      expect(args.actions.completeAndChargeBookingAction).toHaveBeenCalledWith(
        expect.objectContaining({ charges: [{ amount: 600_000, method: 'cash', team: 2 }] }),
      ),
    )

    // $60.000 en dos equipos de $30.000: el Equipo 2 debe $24.000 y el 1, los $30.000.
    await waitFor(() =>
      expect(
        within(dialog.getByRole('group', { name: 'Equipo 2' })).getByText(/Ya pagó \$\s6\.000/),
      ).toBeVisible(),
    )
    await expect(
      within(dialog.getByRole('group', { name: 'Equipo 2' })).getByRole('button', {
        name: /Cobrar \$\s24\.000 al Equipo 2/,
      }),
    ).toBeVisible()
    await expect(
      within(dialog.getByRole('group', { name: 'Equipo 1' })).getByRole('button', {
        name: /Cobrar \$\s30\.000 al Equipo 1/,
      }),
    ).toBeVisible()
  },
}

/**
 * Un equipo junta su mitad con dos medios (efectivo y transferencia): los dos
 * cobros salen en UN llamado, los dos con su equipo, y el botón dice la suma.
 */
export const UnEquipoPagaConDosMedios: Story = {
  args: scenario(terminado()),
  play: async ({ args }) => {
    const dialog = await openDialog()
    await userEvent.click(dialog.getByRole('radio', { name: 'Por equipo' }))
    const team1 = within(dialog.getByRole('group', { name: 'Equipo 1' }))

    await userEvent.click(team1.getByRole('button', { name: 'Agregar pago dividido del Equipo 1' }))
    const first = team1.getByRole('textbox', { name: 'Monto del Equipo 1 · cobro 1' })
    await userEvent.clear(first)
    await userEvent.type(first, '20000')
    await userEvent.type(
      team1.getByRole('textbox', { name: 'Monto del Equipo 1 · cobro 2' }),
      '10000',
    )

    await userEvent.click(team1.getByRole('button', { name: /Cobrar \$\s30\.000 al Equipo 1/ }))
    await waitFor(() =>
      expect(args.actions.completeAndChargeBookingAction).toHaveBeenCalledWith(
        expect.objectContaining({
          charges: [
            { amount: 2_000_000, method: 'cash', team: 1 },
            { amount: 1_000_000, method: 'transfer', team: 1 },
          ],
        }),
      ),
    )
  },
}

/**
 * Por jugador: "Pagó uno" una vez por cada uno. Sobre un turno EN JUEGO, así los
 * dos cobros van por la misma acción y se puede aseverar lo que importa: cada
 * uno viaja con SU clave de idempotencia. Con la misma clave, el servidor
 * tomaría el segundo por un reintento del primero y la plata no entraría.
 */
export const PorJugadorCobraUnoPorUnoConClavesDistintas: Story = {
  args: scenario(enJuego()),
  play: async ({ args }) => {
    const dialog = await openDialog()
    await userEvent.click(dialog.getByRole('radio', { name: 'Por jugador' }))
    // El diálogo entra con una animación de opacidad: se espera a que termine.
    await waitFor(() =>
      expect(dialog.getByText(/Todavía no pagó nadie · cada uno \$\s6\.000/)).toBeVisible(),
    )

    await userEvent.click(dialog.getByRole('button', { name: /Pagó uno/ }))
    await waitFor(() => expect(args.actions.addBookingChargeAction).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(dialog.getByText(/Pagaron 1 de 10/)).toBeVisible())
    // Recién cuando llegó el saldo nuevo se puede cobrar al siguiente.
    await waitFor(() => expect(dialog.getByRole('button', { name: /Pagó uno/ })).toBeEnabled())

    await userEvent.click(dialog.getByRole('button', { name: /Pagó uno/ }))
    await waitFor(() => expect(args.actions.addBookingChargeAction).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(dialog.getByText(/Pagaron 2 de 10/)).toBeVisible())

    const [first, second] = (
      args.actions.addBookingChargeAction as unknown as {
        mock: { calls: Array<[{ clientIdempotencyKey: string; charges: Charged }]> }
      }
    ).mock.calls.map((call) => call[0])
    await expect(first!.charges).toEqual([{ amount: 600_000, method: 'cash' }])
    await expect(second!.charges).toEqual([{ amount: 600_000, method: 'cash' }])
    await expect(first!.clientIdempotencyKey).not.toEqual(second!.clientIdempotencyKey)
  },
}

/** Si ya pagó parte de la gente, abre directo en "Por jugador". */
export const AbreEnPorJugadorSiYaPagoAlguien: Story = {
  args: scenario(terminado({ totalPaid: 2_400_000, pending: 3_600_000 })),
  play: async () => {
    const dialog = await openDialog()
    await expect(dialog.getByRole('radio', { name: 'Por jugador' })).toBeChecked()
    await expect(dialog.getByText(/Pagaron 4 de 10/)).toBeVisible()
  },
}

/** Si un equipo ya pagó (justo la mitad), abre en "Por equipo" con ese equipo "Pagó". */
export const AbreEnPorEquipoSiYaPagoUnEquipo: Story = {
  args: scenario(terminado({ totalPaid: 3_000_000, pending: 3_000_000 })),
  play: async () => {
    const dialog = await openDialog()
    await expect(dialog.getByRole('radio', { name: 'Por equipo' })).toBeChecked()
    await expect(
      within(dialog.getByRole('group', { name: 'Equipo 1' })).getByText('Pagó'),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: /Cobrar .* al Equipo 2/ })).toBeVisible()
  },
}

/** Lo que pagó el Equipo 2 queda del Equipo 2 al volver a abrir el turno otro rato. */
export const AbreConElEquipo2YaPagado: Story = {
  args: scenario(terminado({ totalPaid: 3_000_000, pending: 3_000_000, team2Paid: 3_000_000 })),
  play: async () => {
    const dialog = await openDialog()
    await expect(dialog.getByRole('radio', { name: 'Por equipo' })).toBeChecked()
    await expect(
      within(dialog.getByRole('group', { name: 'Equipo 2' })).getByText('Pagó'),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: /Cobrar .* al Equipo 1/ })).toBeVisible()
  },
}

/** Con la seña, la mitad de cada equipo sale de lo que se cobra en el mostrador. */
export const ConSenaLaMitadNoLaIncluye: Story = {
  args: scenario(
    terminado({
      depositStatus: 'paid',
      depositAmount: 1_200_000,
      totalPaid: 1_200_000,
      pending: 4_800_000,
    }),
  ),
  play: async () => {
    const dialog = await openDialog()
    await waitFor(() =>
      expect(dialog.getByText(/Precio \$\s60\.000 · Cobrado \$\s12\.000/)).toBeVisible(),
    )
    await userEvent.click(dialog.getByRole('radio', { name: 'Por equipo' }))
    // $48.000 en el mostrador: $24.000 cada equipo (no $30.000).
    await expect(dialog.getByRole('button', { name: /Cobrar .* al Equipo 1/ })).toHaveTextContent(
      /24\.000/,
    )
    await expect(dialog.getByRole('button', { name: /Cobrar .* al Equipo 2/ })).toHaveTextContent(
      /24\.000/,
    )
  },
}

/** Sin nada que cobrar: "Cobrado ✓" y "Listo", ningún formulario de cobro. */
export const YaCobrado: Story = {
  args: scenario(terminado({ status: 'completed', totalPaid: 6_000_000, pending: 0 })),
  play: async () => {
    const dialog = await openDialog()
    await expect(dialog.getByText('Cobrado ✓')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Listo' })).toBeVisible()
    await expect(dialog.queryByRole('radio')).toBeNull()
  },
}

/** El servidor rechaza el cobro: el aviso queda a la vista y el modal abierto. */
export const ErrorDeCobro: Story = {
  args: scenario(terminado(), { fail: 'La caja no acepta cobros en este momento.' }),
  play: async () => {
    const dialog = await openDialog()
    await userEvent.click(
      dialog.getByRole('button', { name: /Cobrar \$\s60\.000 y dar por jugado/ }),
    )
    await waitFor(() =>
      expect(dialog.getByRole('alert')).toHaveTextContent(
        'La caja no acepta cobros en este momento.',
      ),
    )
    // Y se puede volver a intentar.
    await waitFor(() =>
      expect(
        dialog.getByRole('button', { name: /Cobrar \$\s60\.000 y dar por jugado/ }),
      ).toBeEnabled(),
    )
  },
}

/**
 * Un cobro que se corta por la red: no se sabe si entró. El aviso de reintento vive
 * en el modal, así que cerrarlo lo pierde — y al reabrir, "Pagó uno" cobraría de
 * nuevo con una clave nueva contra un saldo viejo. Por eso cerrar refresca la
 * pantalla: al reabrir el turno, el saldo es el real.
 */
export const CerrarConUnCobroSinConfirmarRefresca: Story = {
  args: scenario(terminado(), { networkError: true }),
  play: async ({ args }) => {
    const dialog = await openDialog()
    await userEvent.click(
      dialog.getByRole('button', { name: /Cobrar \$\s60\.000 y dar por jugado/ }),
    )
    await waitFor(() => expect(dialog.getByRole('alert')).toHaveTextContent(/Se cortó la conexión/))
    await expect(dialog.getByRole('button', { name: /Reintentar cobro/ })).toBeVisible()
    await expect(args.onRefresh).not.toHaveBeenCalled()

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(args.onClose).toHaveBeenCalledTimes(1))
    await expect(args.onRefresh).toHaveBeenCalledTimes(1)
  },
}

/** Mientras los datos se refrescan, ningún control de cobro se puede tocar. */
export const RefrescandoBloqueaElCobro: Story = {
  args: scenario(terminado(), { forceRefreshing: true }),
  play: async () => {
    const dialog = await openDialog()
    await expect(
      dialog.getByRole('button', { name: /Cobrar \$\s60\.000 y dar por jugado/ }),
    ).toBeDisabled()
    await expect(dialog.getByRole('button', { name: /Cantina/ })).toBeDisabled()
  },
}

/** Una seña sin pagar no se cobra en el mostrador: el modal explica por qué. */
export const EsperandoSena: Story = {
  args: scenario(enJuego({ status: 'pending_payment' })),
  play: async () => {
    const dialog = await openDialog()
    await expect(dialog.queryByRole('radio')).toBeNull()
    await expect(dialog.queryByRole('button', { name: /Cobrar/ })).toBeNull()
  },
}

/**
 * Esperando seña CON monto (paso 3, docs/decisions/
 * 2026-09-24-navegacion-panel.md): "Cobrar seña $X" — confirmarla a mano
 * abre el mismo diálogo de método que ya usaba QuickActions en /reservas.
 */
export const EsperandoSenaConMontoOfreceCobrarla: Story = {
  args: scenario(
    enJuego({ status: 'pending_payment', depositStatus: 'pending', depositAmount: 450_000 }),
  ),
  play: async ({ args }) => {
    const dialog = await openDialog()
    await userEvent.click(dialog.getByRole('button', { name: /^Cobrar seña \$\s4\.500$/ }))

    const body = within(document.body)
    const confirm = await body.findByRole('dialog', { name: 'Cobrar seña' })
    await expect(within(confirm).getByRole('radio', { name: 'Efectivo' })).toBeChecked()
    await userEvent.click(within(confirm).getByRole('button', { name: /^Cobrar \$\s4\.500$/ }))

    await waitFor(() =>
      expect(args.actions.confirmDepositPaymentAction).toHaveBeenCalledWith('b1', 'cash'),
    )
  },
}

/** Un bloqueo de mantenimiento no se cobra: la única acción es liberarlo. */
export const Bloqueo: Story = {
  args: scenario(enJuego({ type: 'block', priceSnapshot: 0, pending: 0, guestName: null })),
  play: async ({ args }) => {
    const dialog = await openDialog()
    await expect(dialog.queryByRole('radio')).toBeNull()
    await expect(dialog.queryByRole('button', { name: /Cobrar/ })).toBeNull()
    await expect(dialog.getByRole('button', { name: 'Liberar el bloqueo' })).toBeVisible()

    await userEvent.click(dialog.getByRole('button', { name: 'Liberar el bloqueo' }))
    const body = within(document.body)
    const confirm = await body.findByRole('dialog', { name: 'Liberar el bloqueo' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Liberar' }))

    await waitFor(() => expect(args.actions.releaseBlockAction).toHaveBeenCalledWith('b1'))
  },
}

/** Un ausente no debe plata (veto "No-show NO es deuda") pero tampoco está "Cobrado ✓". */
export const Ausente: Story = {
  args: scenario(terminado({ status: 'no_show', depositStatus: 'captured', pending: 0 })),
  play: async () => {
    const dialog = await openDialog()
    await expect(dialog.queryByText('Cobrado ✓')).toBeNull()
    await expect(dialog.getByRole('button', { name: 'Deshacer la ausencia' })).toBeVisible()
  },
}

/** Una hora de torneo no se cobra por turno. */
export const HoraDeTorneo: Story = {
  args: scenario(
    enJuego({
      type: 'tournament',
      tournamentId: 't1',
      priceSnapshot: 0,
      pending: 0,
      guestName: 'Copa',
    }),
  ),
  play: async () => {
    const dialog = await openDialog()
    await expect(dialog.getByText(/Esta hora la ocupa un torneo/)).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Ir al torneo' })).toBeVisible()
    await expect(dialog.queryByRole('button', { name: /Ausente/ })).toBeNull()
  },
}
