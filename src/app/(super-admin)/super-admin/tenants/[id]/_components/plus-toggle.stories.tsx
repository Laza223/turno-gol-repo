import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { PlusToggle, type PlusToggleState, type SetTenantPlusAction } from './plus-toggle'

const TENANT = '00000000-0000-4000-8000-000000000001'

const billed: PlusToggleState = {
  kind: 'billed',
  pricePerCourtCents: null,
  effectivePerCourtCents: 1_500_000,
  accessUntil: null,
  quote: null,
}

const meta = {
  title: 'SuperAdmin/TenantDetail/PlusToggle',
  component: PlusToggle,
  parameters: { layout: 'padded' },
  args: {
    tenantId: TENANT,
    state: {
      kind: 'off',
      pricePerCourtCents: null,
      effectivePerCourtCents: 1_500_000,
      accessUntil: null,
      quote: null,
    },
    action: fn<SetTenantPlusAction>(async () => ({
      success: true as const,
      message: 'Plus prendido: el próximo débito suma $ 15.000 por cancha.',
    })),
  },
  decorators: [
    (Story) => (
      <section className="rounded-lg border border-border bg-card p-6 shadow-xs">
        <h2 className="text-base font-semibold text-foreground">Datos del complejo</h2>
        <div className="mt-4">
          <Story />
        </div>
      </section>
    ),
  ],
} satisfies Meta<typeof PlusToggle>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Apagado: el campo arranca VACÍO (= lista, con la lista de placeholder) y
 * prender sin tipear manda `null`: así el complejo sigue a la lista.
 */
export const Apagado: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Precio por cancha')
    await expect(input).toHaveValue(null)
    await expect(input).toHaveAttribute('placeholder', '15.000 (lista)')
    await userEvent.click(canvas.getByRole('button', { name: 'Prender Plus' }))
    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith(TENANT, {
        op: 'enable',
        pricePerCourtCents: null,
      }),
    )
    await expect(await canvas.findByRole('status')).toHaveTextContent('Plus prendido')
  },
}

/** Un precio especial tipeado viaja en centavos; tras el éxito el campo vuelve al valor del estado. */
export const ApagadoPrecioEspecial: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Precio por cancha')
    await userEvent.type(input, '15000')
    await userEvent.click(canvas.getByRole('button', { name: 'Prender Plus' }))
    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith(TENANT, {
        op: 'enable',
        pricePerCourtCents: 1_500_000,
      }),
    )
    await expect(await canvas.findByRole('status')).toHaveTextContent('Plus prendido')
    // El estado de esta story no cambia (sin recarga real): el campo vuelve a vacío.
    await waitFor(() => expect(input).toHaveValue(null))
  },
}

/** Un 0 tipeado no llega a la action (vacío es la lista; 0 es un error). */
export const PrecioInvalido: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Precio por cancha'), '0')
    await userEvent.click(canvas.getByRole('button', { name: 'Prender Plus' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('mayor a cero')
    await expect(args.action).not.toHaveBeenCalled()
  },
}

/** Facturado: se actualiza el precio con el campo. */
export const Facturado: Story = {
  args: { state: { ...billed, pricePerCourtCents: 1_500_000, effectivePerCourtCents: 1_500_000 } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText(/Facturado: .*15\.000 por cancha \(precio especial\)/),
    ).toBeInTheDocument()
    const input = canvas.getByLabelText('Precio por cancha')
    await expect(input).toHaveValue(15000)
    await userEvent.clear(input)
    await userEvent.type(input, '18000')
    await userEvent.click(canvas.getByRole('button', { name: 'Actualizar precio' }))
    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith(TENANT, {
        op: 'enable',
        pricePerCourtCents: 1_800_000,
      }),
    )
  },
}

/** Facturado a la lista: campo vacío; vaciar un especial vuelve a la lista (`null`). */
export const FacturadoALista: Story = {
  args: { state: billed },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Facturado: .*15\.000 por cancha \(lista\)/)).toBeInTheDocument()
    await expect(canvas.getByLabelText('Precio por cancha')).toHaveValue(null)
    await userEvent.click(canvas.getByRole('button', { name: 'Actualizar precio' }))
    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith(TENANT, { op: 'enable', pricePerCourtCents: null }),
    )
  },
}

export const FacturadoBajaFinDePeriodo: Story = {
  args: { state: billed },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Dar de baja (fin de período)' }))
    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith(TENANT, { op: 'disable', mode: 'end_of_period' }),
    )
  },
}

/** "Apagar ya" avisa que el bot calla en el acto y que no se devuelve nada. */
export const ApagarYaPideConfirmacion: Story = {
  args: { state: billed },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Apagar ya' }))
    const dialog = await screen.findByRole('dialog')
    await expect(
      within(dialog).getByText(/No se devuelve nada de forma automática/),
    ).toBeInTheDocument()
    await expect(args.action).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar ya' }))
    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith(TENANT, { op: 'disable', mode: 'immediate' }),
    )
  },
}

/** F7b: tras "Apagar ya" exitoso el campo no conserva lo último que se tipeó. */
export const ApagarYaLimpiaElCampo: Story = {
  args: {
    state: {
      kind: 'manual_override',
      pricePerCourtCents: null,
      effectivePerCourtCents: 1_500_000,
      accessUntil: null,
      quote: null,
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Precio por cancha')
    await userEvent.type(input, '18000')
    await userEvent.click(canvas.getByRole('button', { name: 'Apagar ya' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar ya' }))
    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith(TENANT, { op: 'disable', mode: 'immediate' }),
    )
    await waitFor(() => expect(input).toHaveValue(null))
  },
}

/** Baja agendada: se puede volver a prender con el precio actual. */
export const BajaAgendada: Story = {
  args: {
    state: {
      kind: 'ending',
      pricePerCourtCents: 1_500_000,
      effectivePerCourtCents: 1_500_000,
      accessUntil: '2027-03-15T12:00:00.000Z',
      quote: null,
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Baja agendada: activo hasta el 15/03')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Volver a prender' }))
    await waitFor(() =>
      expect(args.action).toHaveBeenCalledWith(TENANT, {
        op: 'enable',
        pricePerCourtCents: 1_500_000,
      }),
    )
  },
}

/** Anual a mitad de año: esperando el pago de los meses que faltan. */
export const CotizacionPendiente: Story = {
  args: {
    state: {
      kind: 'quote_pending',
      pricePerCourtCents: null,
      effectivePerCourtCents: 1_500_000,
      accessUntil: null,
      quote: { months: 5, amountCents: 18_000_000 },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Esperando el pago de 5 meses: .*180\.000/)).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Apagar ya' })).toBeInTheDocument()
  },
}

/** El caso de El Vagón: bot prendido a mano, hoy no se le cobra. */
export const PrendidoAMano: Story = {
  args: {
    state: {
      kind: 'manual_override',
      pricePerCourtCents: null,
      effectivePerCourtCents: 1_500_000,
      accessUntil: null,
      quote: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Prendido a mano (sin cobro)')).toBeInTheDocument()
    await expect(canvas.getByText(/Hoy no se le cobra nada/)).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Prender Plus' })).toBeInTheDocument()
  },
}

/** Si el service rechaza, el error queda en pantalla. */
export const ErrorDelService: Story = {
  args: {
    action: fn<SetTenantPlusAction>(async () => ({
      success: false as const,
      error: 'Primero tiene que regularizar el pago.',
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Prender Plus' }))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('regularizar el pago')
  },
}

/**
 * Sin suscripción: no hay débito donde meter Plus, así que no se ofrece prenderlo;
 * pero el bot puede estar prendido por un override y eso se muestra tal cual.
 */
export const SinSuscripcionConBotPrendido: Story = {
  args: {
    state: {
      kind: 'no_subscription',
      botOn: true,
      pricePerCourtCents: null,
      effectivePerCourtCents: 1_500_000,
      accessUntil: null,
      quote: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Sin suscripción · bot prendido a mano (sin cobro)'),
    ).toBeInTheDocument()
    await expect(canvas.queryByText('Apagado')).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Prender Plus' })).toBeNull()
  },
}

export const SinSuscripcionConBotApagado: Story = {
  args: {
    state: {
      kind: 'no_subscription',
      botOn: false,
      pricePerCourtCents: null,
      effectivePerCourtCents: 1_500_000,
      accessUntil: null,
      quote: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Sin suscripción · bot apagado')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Prender Plus' })).toBeNull()
  },
}
