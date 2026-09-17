import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import {
  booking,
  bookingBlock,
  bookingCompleted,
  bookingNoShow,
  toGridBooking,
} from '@/test/fixtures/booking'
import { player } from '@/test/fixtures/player'
import { courtFutbol5, courtFutbol7 } from '@/test/fixtures/court'
import { BookingSlotPanel, type SlotPanelActions } from './BookingSlotPanel'

/**
 * Panel lateral del turno (Fase 3): cobrar, cargar cantina, marcar ausente y
 * reprogramar, sin salir de la grilla.
 *
 * Qué acción ofrece NO sale del status a secas: cruza estado, tipo y plata
 * pendiente. Las stories de abajo son una por rama de esa decisión, que es
 * donde está el riesgo real (ofrecer "cobrar" en un turno que el backend va a
 * rechazar, "marcar ausente" en una hora de torneo, o "reprogramar" uno ya
 * jugado que `rescheduleBooking` rechaza por estado terminal).
 *
 * Las Server Actions llegan por prop: importarlas arrastraría `node:async_hooks`
 * y rompería el bundle de Storybook. El diálogo de cantina, además, llega
 * inyectado (`renderCanteenDialog`) porque vive bajo la ruta — acá va un stub.
 */
const okActions = (): SlotPanelActions => ({
  chargeDebtAction: fn(async () => ({ success: true as const })),
  completeAndChargeBookingAction: fn(async () => ({ success: true as const })),
  addBookingChargeAction: fn(async () => ({ success: true as const })),
  markNoShowAction: fn(async () => ({ success: true as const })),
  revertNoShowAction: fn(async () => ({ success: true as const })),
  listRescheduleSlotsAction: fn(async () => ({
    success: true as const,
    slots: [
      { timeStart: '19:00', timeEnd: '20:00', price: 2400000, available: true },
      { timeStart: '20:00', timeEnd: '21:00', price: 2400000, available: false },
      { timeStart: '21:00', timeEnd: '22:00', price: 2800000, available: true },
    ],
    minDate: '2026-08-04',
    maxDate: '2026-08-10',
  })),
  rescheduleBookingAction: fn(async () => ({ success: true, priceChanged: true })),
  releaseBlockAction: fn(async () => ({ success: true as const })),
})

// Los ids salen de las fixtures y NO de strings inventados: el panel busca la
// cancha del turno por `courtId` para sacar su `capacity` (jugadores que entran
// = format × 2), y con ids que no matchean el atajo "Pagó uno" no aparecería —
// la story pasaría en verde sin probar nada.
const COURTS = [
  { id: courtFutbol5().id, name: 'Cancha 1', capacity: courtFutbol5().capacity },
  { id: courtFutbol7().id, name: 'Cancha 2', capacity: courtFutbol7().capacity },
]

/** Un turno de hoy que ya terminó — es cuando el mostrador cobra de verdad. */
const AYER = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

const meta = {
  title: 'Booking/Grid/BookingSlotPanel',
  component: BookingSlotPanel,
  parameters: { layout: 'fullscreen' },
  args: {
    courtName: 'Cancha 1',
    onClose: fn(),
    // Lo decide la grilla (día operativo), no el panel — ver la prop.
    hasEnded: true,
    courts: COURTS,
    renderCanteenDialog: ({ open }) =>
      open ? <p style={{ padding: 16 }}>[diálogo de cantina]</p> : null,
    actions: okActions(),
    booking: {
      ...toGridBooking(booking(), player()),
      date: AYER,
      priceSnapshot: 2400000,
      totalPaid: 720000,
      pending: 1680000,
    },
  },
} satisfies Meta<typeof BookingSlotPanel>

export default meta
type Story = StoryObj<typeof meta>

/** Confirmado, ya terminó, con saldo: cobrar y dar por jugado en un solo paso. */
export const CobrarYCerrar: Story = {
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    // El monto va EN el botón: es lo que falta, y verlo antes de tocar evita
    // tener que leer una tabla para saber qué se está por cobrar.
    await expect(
      await panel.findByRole('button', { name: /^Cobrar \$.?16\.800 y dar por jugado$/ }),
    ).toBeTruthy()
    await expect(await panel.findByText('Falta cobrar')).toBeTruthy()
    await expect(await panel.findByRole('button', { name: /Cargar cantina/ })).toBeTruthy()
    // Confirmado ⇒ todavía se puede mover (RESCHEDULABLE_STATUSES), pero es
    // tarea semanal: vive detrás de "Más".
    await expect(panel.queryByRole('button', { name: /Reprogramar/ })).toBeNull()
    await userEvent.click(await panel.findByRole('button', { name: 'Más' }))
    await expect(await panel.findByRole('button', { name: /Reprogramar/ })).toBeTruthy()
  },
}

/**
 * El cobro lo rechaza el backend (caja del día ya cerrada, por ejemplo): el
 * panel queda abierto con el motivo, sin dar el turno por jugado.
 *
 * El aviso de la sección de cobro sólo existe después de un submit fallido,
 * así que sin esta story axe no medía nunca su contraste — el mismo agujero
 * que en la grilla dejó un `text-destructive` por debajo de AA sin que nadie
 * lo viera.
 */
export const CobroRechazado: Story = {
  args: {
    actions: {
      ...okActions(),
      completeAndChargeBookingAction: fn(async () => ({
        success: false as const,
        error: 'La caja de ese día ya está cerrada.',
      })),
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    // El botón cobra TODO lo pendiente con el método elegido arriba: no hay
    // formulario de por medio.
    await userEvent.click(
      await panel.findByRole('button', { name: /^Cobrar \$.?16\.800 y dar por jugado$/ }),
    )

    await expect(await panel.findByRole('alert')).toHaveTextContent(
      'La caja de ese día ya está cerrada.',
    )
    // El panel no se cierra ni da el turno por jugado.
    await expect(
      await panel.findByRole('button', { name: /^Cobrar \$.?16\.800 y dar por jugado$/ }),
    ).toBeTruthy()
  },
}

/** Jugado con saldo: la alarma de la grilla. Sólo queda cobrar lo que falta. */
export const JugadaSinCobrar: Story = {
  args: {
    booking: {
      ...toGridBooking(bookingCompleted()),
      date: AYER,
      priceSnapshot: 2400000,
      totalPaid: 0,
      pending: 2400000,
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(await panel.findByRole('button', { name: /^Cobrar \$.?24\.000$/ })).toBeTruthy()
    // Estado terminal: no hay nada que plegar —ni reprogramar, ni marcar
    // ausente, ni cancelar—, así que tampoco aparece el botón "Más".
    await expect(panel.queryByRole('button', { name: 'Más' })).toBeNull()
    await expect(panel.queryByRole('button', { name: /Reprogramar/ })).toBeNull()
    // Pero la cantina sí: se consume durante el partido y se paga al final.
    await expect(await panel.findByRole('button', { name: /Cargar cantina/ })).toBeTruthy()
  },
}

/** Confirmado pero todavía no jugado: es un adelanto (D3: admite N líneas, igual que los otros dos modos). */
export const CobrarPorAdelantado: Story = {
  args: {
    hasEnded: false,
    booking: {
      ...toGridBooking(booking(), player()),
      priceSnapshot: 2400000,
      totalPaid: 0,
      pending: 2400000,
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(
      await panel.findByRole('button', { name: /^Cobrar \$.?24\.000 por adelantado$/ }),
    ).toBeTruthy()
    // Un turno futuro no puede estar "ausente": todavía no pasó nada, ni
    // siquiera detrás de "Más".
    await userEvent.click(await panel.findByRole('button', { name: 'Más' }))
    await expect(panel.queryByRole('button', { name: /Marcar ausente/ })).toBeNull()
  },
}

/**
 * D3 (2026-09-15): el monto queda a la vista y se puede bajar para cobrar un
 * adelanto parcial — el reclamo real era que, con el turno en rojo, el panel
 * solo ofrecía cobrar el pendiente completo.
 *
 * `userEvent.clear` reemplaza el valor precargado ("24.000", un valor ya
 * agrupado en miles) por vacío antes de tipear — la forma soportada por
 * `@testing-library/user-event` de simular "seleccionar todo y escribir
 * encima" en un browser real. Se probó con `userEvent.click` + `type` directo
 * (equivalente a un click real con el fix de foco/mouse de
 * `SlotChargeSection.tsx`) y el propio simulador de `userEvent` posiciona el
 * caret con su lógica interna, no la del navegador — no sirve para ejercitar
 * ESTE mecanismo puntual en este harness. La corrupción que diagnosticó
 * Stream D (money.ts) queda cubierta igual: acá abajo se verifica que
 * reemplazar el valor NO produce el monto corrompido ("$240.006") y llega
 * limpio a la action.
 */
export const CobroParcialEnAdelanto: Story = {
  args: {
    hasEnded: false,
    booking: {
      ...toGridBooking(booking(), player()),
      priceSnapshot: 2400000,
      totalPaid: 0,
      pending: 2400000, // $24.000 pendientes, nada cobrado todavía
    },
  },
  play: async ({ canvasElement, args }) => {
    const panel = within(canvasElement.ownerDocument.body)
    const amountInput = (await panel.findByPlaceholderText('Monto')) as HTMLInputElement
    await expect(amountInput.value).toBe('24.000')

    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '6000')
    await expect(amountInput.value).toBe('6.000')

    await userEvent.click(
      await panel.findByRole('button', {
        name: /^Cobrar \$.?6\.000 por adelantado · quedan \$.?18\.000$/,
      }),
    )

    await waitFor(() =>
      expect(args.actions?.addBookingChargeAction).toHaveBeenCalledWith(
        expect.objectContaining({ charges: [{ amount: 600_000, method: 'cash' }] }),
      ),
    )
  },
}

/**
 * Cobro de a partes — los complejos casi nunca cobran el turno entero de una: o
 * juntan por equipo, o cada jugador paga lo suyo cuando llega. Los dos atajos
 * son botones y no el link gris de "Cobrar otro monto": es el camino normal de
 * mucha gente, no la excepción.
 *
 * El turno es una F5 ($24.000, 10 jugadores): la mitad es $12.000 y la parte de
 * cada uno, $2.400. Los montos van ADENTRO del rótulo, que es lo que hace que el
 * encargado entienda el botón sin que nadie se lo explique.
 */
export const CobrarDeAPartes: Story = {
  args: {
    booking: {
      ...toGridBooking(bookingCompleted()),
      courtId: courtFutbol5().id,
      date: AYER,
      priceSnapshot: 2400000,
      depositStatus: 'not_required',
      depositAmount: 0,
      totalPaid: 0,
      pending: 2400000,
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(await panel.findByRole('button', { name: /^Cobrar \$.?24\.000$/ })).toBeTruthy()
    await expect(await panel.findByRole('button', { name: 'Dividir pago por equipo' })).toBeTruthy()
    await expect(await panel.findByRole('button', { name: /^Pagó uno — \$.?2\.400$/ })).toBeTruthy()
    // Todavía no puso nadie: contar gente acá no diría nada.
    await expect(panel.queryByText(/^Pagaron /)).toBeNull()
  },
}

/**
 * "Dividir pago por equipo" parte el cobro en dos filas rotuladas, igual que el
 * pago dividido, cada una con su propio "Cobrar". Se le cobra a un equipo solo
 * —el otro todavía no llegó— y el cobro sale por ESA fila, con su monto y su
 * método, sin tocar la del otro equipo.
 */
export const DividirPorEquipo: Story = {
  args: {
    actions: okActions(),
    booking: {
      ...toGridBooking(bookingCompleted()),
      courtId: courtFutbol5().id,
      date: AYER,
      priceSnapshot: 2400000,
      depositStatus: 'not_required',
      depositAmount: 0,
      totalPaid: 0,
      pending: 2400000,
    },
  },
  play: async ({ canvasElement, args }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await userEvent.click(await panel.findByRole('button', { name: 'Dividir pago por equipo' }))

    await expect(await panel.findByText('Equipo 1')).toBeTruthy()
    await expect(await panel.findByText('Equipo 2')).toBeTruthy()
    // En modo equipo los atajos se van: el formulario ya es el atajo.
    await expect(panel.queryByRole('button', { name: /^Pagó uno/ })).toBeNull()
    await expect(panel.queryByRole('button', { name: 'Dividir pago por equipo' })).toBeNull()

    await userEvent.click(await panel.findByRole('button', { name: 'Cobrar al Equipo 1' }))
    // Turno ya jugado = cobro de deuda. Una sola línea: la mitad, en efectivo.
    await waitFor(() =>
      expect(args.actions?.chargeDebtAction).toHaveBeenCalledWith(
        expect.objectContaining({ charges: [{ amount: 1200000, method: 'cash' }] }),
      ),
    )
  },
}

/** "Cobrar en un solo pago" deshace la división y vuelve al monto completo. */
export const DividirYVolver: Story = {
  args: {
    booking: {
      ...toGridBooking(bookingCompleted()),
      courtId: courtFutbol5().id,
      date: AYER,
      priceSnapshot: 2400000,
      depositStatus: 'not_required',
      depositAmount: 0,
      totalPaid: 0,
      pending: 2400000,
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await userEvent.click(await panel.findByRole('button', { name: 'Dividir pago por equipo' }))
    await userEvent.click(await panel.findByRole('button', { name: 'Cobrar en un solo pago' }))
    await waitFor(() => expect(panel.queryByText('Equipo 2')).toBeNull())
    await expect(await panel.findByRole('button', { name: /^Cobrar \$.?24\.000$/ })).toBeTruthy()
    await expect(await panel.findByRole('button', { name: 'Dividir pago por equipo' })).toBeTruthy()
  },
}

/**
 * Cuatro jugadores fueron pagando de a uno. El renglón cuenta gente y "Pagó uno"
 * SIGUE ofreciéndose: es el botón que se toca una vez por jugador que llega.
 *
 * El monto no se repite en el renglón — ya está arriba, en grande.
 */
export const PagaronCuatroDeDiez: Story = {
  args: {
    booking: {
      ...toGridBooking(bookingCompleted()),
      courtId: courtFutbol5().id,
      date: AYER,
      priceSnapshot: 2400000,
      depositStatus: 'not_required',
      depositAmount: 0,
      totalPaid: 960000,
      pending: 1440000,
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(await panel.findByText('Pagaron 4 de 10')).toBeTruthy()
    await expect(await panel.findByRole('button', { name: /^Pagó uno — \$.?2\.400$/ })).toBeTruthy()
    // Ya entró plata: dividir por equipo dejó de tener sentido.
    await expect(panel.queryByRole('button', { name: 'Dividir pago por equipo' })).toBeNull()
  },
}

/**
 * Justo la mitad. El dato útil no es "5 de 10", es que un equipo está saldado —
 * dicho con las mismas palabras que las filas de "Dividir pago por equipo".
 */
export const MitadCobrada: Story = {
  args: {
    booking: {
      ...toGridBooking(bookingCompleted()),
      courtId: courtFutbol5().id,
      date: AYER,
      priceSnapshot: 2400000,
      depositStatus: 'not_required',
      depositAmount: 0,
      totalPaid: 1200000,
      pending: 1200000,
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(await panel.findByText('Equipo 1 pagó · falta Equipo 2')).toBeTruthy()
    await expect(await panel.findByRole('button', { name: /^Cobrar \$.?12\.000$/ })).toBeTruthy()
    await expect(panel.queryByRole('button', { name: 'Dividir pago por equipo' })).toBeNull()
  },
}

/**
 * Seña pagada online y CERO cobros de mostrador: la seña no es gente que pagó en
 * el mostrador. Si contara, todo turno señado por el jugador mentiría.
 *
 * Ojo al monto de "Pagó uno": la parte de cada jugador sale del PRECIO del turno
 * ($2.400), no de lo que falta. Lo que la seña baja es el pendiente.
 */
export const SeniaNoEsGenteQuePago: Story = {
  args: {
    booking: {
      ...toGridBooking(booking(), player()),
      courtId: courtFutbol5().id,
      date: AYER,
      priceSnapshot: 2400000,
      depositStatus: 'paid',
      depositAmount: 720000,
      totalPaid: 720000,
      pending: 1680000,
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(panel.queryByText(/^Pagaron /)).toBeNull()
    await expect(await panel.findByRole('button', { name: 'Dividir pago por equipo' })).toBeTruthy()
    await expect(await panel.findByRole('button', { name: /^Pagó uno — \$.?2\.400$/ })).toBeTruthy()
  },
}

/** Turno saldado: no hay nada que cobrar, el panel no ofrece la sección. */
export const SinSaldo: Story = {
  args: {
    booking: {
      ...toGridBooking(bookingCompleted()),
      date: AYER,
      priceSnapshot: 2400000,
      totalPaid: 2400000,
      pending: 0,
    },
  },
}

/** Ya marcado ausente: la única acción es deshacerlo (ventana de 24hs). */
export const Ausente: Story = {
  args: {
    booking: {
      ...toGridBooking(bookingNoShow()),
      date: AYER,
      priceSnapshot: 2400000,
      totalPaid: 720000,
      pending: 1680000,
    },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(await panel.findByRole('button', { name: /Deshacer la ausencia/ })).toBeTruthy()
  },
}

/** Bloqueo de mantenimiento: no es la reserva de nadie, no hay plata ni ausencia. */
export const Bloqueo: Story = {
  args: {
    booking: { ...toGridBooking(bookingBlock()), date: AYER, pending: 0, totalPaid: 0 },
  },
  play: async ({ canvasElement }) => {
    const panel = within(canvasElement.ownerDocument.body)
    await expect(panel.queryByRole('button', { name: /Marcar ausente/ })).toBeNull()
    // No es el turno de nadie: no hay a quién venderle ni a quién mover.
    await expect(panel.queryByRole('button', { name: /Cargar cantina/ })).toBeNull()
    await expect(panel.queryByRole('button', { name: /Reprogramar/ })).toBeNull()
    // RI G2.1: sí ofrece liberar el bloqueo (DELETE físico, no una cancelación).
    await expect(await panel.findByRole('button', { name: /Liberar el bloqueo/ })).toBeTruthy()
  },
}

/** Sin Server Actions (el modo en el que corren otras stories): abre igual, sólo mira. */
export const SoloLectura: Story = {
  args: { actions: undefined },
}

/**
 * El MISMO error, en tema oscuro.
 *
 * Antes de esta tanda el repo no tenía UNA sola story en dark (`globals.theme`
 * quedaba siempre en 'light'), así que axe venía midiendo medio design system.
 * Y el lado sin medir era justo donde el rojo del token se cae:
 * `text-destructive` es red-600 en los dos temas, y sobre la superficie oscura
 * daba 3.87:1.
 */
export const CobroRechazadoOscuro: Story = {
  ...CobroRechazado,
  globals: { theme: 'dark' },
}
