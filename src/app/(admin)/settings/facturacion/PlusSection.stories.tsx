import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { PlusSection } from './PlusSection'

/**
 * Asistente de WhatsApp (Plus) en Facturación. Las actions entran por prop:
 * importarlas como valor arrastra drizzle/postgres al bundle.
 */
const meta = {
  title: 'Settings/Facturacion/PlusSection',
  component: PlusSection,
  parameters: { layout: 'padded' },
  args: {
    periodEnd: '2027-03-15T12:00:00.000Z',
    plus: { enabled: true, perCourtCents: 1_500_000, accessUntil: null, quote: null },
    disableAction: fn(async () => ({
      success: true as const,
      accessUntil: '2027-03-15T12:00:00.000Z',
    })),
    payAction: fn(async () => ({
      success: false as const,
      error: 'No pudimos abrir el pago. Intentá de nuevo.',
    })),
  },
} satisfies Meta<typeof PlusSection>

export default meta
type Story = StoryObj<typeof meta>

/** Facturado: precio por cancha y baja con confirmación en el mismo lugar. */
export const Facturado: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Incluido en tu cuota: .*15\.000 por cancha/)).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Dar de baja el Asistente' }))
    const dialog = await screen.findByRole('dialog')
    await expect(
      within(dialog).getByText(
        /Sigue andando hasta el 15\/03\. Tu próximo débito ya no lo incluye\./,
      ),
    ).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Dar de baja' }))
    await waitFor(() => expect(args.disableAction).toHaveBeenCalledTimes(1))
  },
}

/** Baja agendada: sin botón para deshacerla (volver a prenderlo lo hace TurnoGol). */
export const BajaAgendada: Story = {
  args: {
    plus: {
      enabled: false,
      perCourtCents: 1_500_000,
      accessUntil: '2027-03-15T12:00:00.000Z',
      quote: null,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText('Activo hasta el 15/03. El próximo débito ya no lo incluye.'),
    ).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /Dar de baja|Pagar|Deshacer/ })).toBeNull()
  },
}

/** Anual a mitad de año: hay que pagar los meses que faltan; si el pago no abre, se ve el error. */
export const CotizacionPendiente: Story = {
  args: {
    plus: {
      enabled: false,
      perCourtCents: 1_500_000,
      accessUntil: null,
      quote: { months: 5, amountCents: 18_000_000 },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/pagá los 5 meses que faltan: .*180\.000/)).toBeInTheDocument()
    await expect(
      canvas.getByText('Cuando se acredite el pago, el Asistente se prende solo.'),
    ).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: /Pagar .*180\.000/ }))
    await waitFor(() => expect(args.payAction).toHaveBeenCalledTimes(1))
    await expect(await canvas.findByRole('alert')).toHaveTextContent('No pudimos abrir el pago')
  },
}
