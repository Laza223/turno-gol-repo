import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { CajaHeaderStats } from './CajaHeaderStats'

/**
 * Los tres números de /caja/cuentas. Es donde el semáforo financiero del
 * MASTER (§2.5) se lee entero: verde lo que entró, ámbar lo que te deben, rojo
 * lo que debés — y verde otra vez cuando no hay nada pendiente, que no es un
 * vacío sino un premio.
 *
 * El desglose por método vive DENTRO de la card de "Cobrado hoy" y sus partes
 * suman el total de arriba. Ese es el contrato que las stories miden: un
 * desglose que no suma convierte la card en dos números que se contradicen.
 */
const meta = {
  title: 'Admin/Caja/CajaHeaderStats',
  component: CajaHeaderStats,
  parameters: { layout: 'padded' },
  args: {
    collectedTodayCents: 11_800_00,
    collectedByMethod: { cash: 5_750_00, transfer: 450_00, mercadopago: 5_600_00 },
    streetMoneyCents: 123_500_00,
    streetMoneyCount: 7,
    pendingRefundsCents: 28_000_00,
    pendingRefundsCount: 2,
  },
} satisfies Meta<typeof CajaHeaderStats>

export default meta
type Story = StoryObj<typeof meta>

/** Un viernes a la noche: entró plata, te deben y debés. */
export const ConPlataPendiente: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Las partes del desglose suman exactamente el total de la card.
    // `formatArs` separa con espacio duro y testing-library NO normaliza el
    // matcher, así que se busca por nodo y se compara el texto ya renderizado.
    await expect(canvas.getByText('Cobrado hoy')).toBeVisible()
    for (const label of ['Efectivo', 'Transferencia', 'MercadoPago']) {
      await expect(canvas.getByText(label)).toBeVisible()
    }

    await expect(canvas.getByText('7 pendientes de cobro')).toBeVisible()
    await expect(canvas.getByText('2 señas sin devolver')).toBeVisible()
  },
}

/**
 * Nada pendiente. Las dos cards pasan a verde y lo dicen con texto, no solo
 * con color (MASTER §1.4: nada comunica únicamente con color).
 */
export const TodoAlDia: Story = {
  args: {
    streetMoneyCents: 0,
    streetMoneyCount: 0,
    pendingRefundsCents: 0,
    pendingRefundsCount: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Nadie te debe nada')).toBeVisible()
    await expect(canvas.getByText('No debés ninguna seña')).toBeVisible()
  },
}

/** Recién abierto: el desglose no puede mostrar un vacío mudo. */
export const SinCobrosTodavia: Story = {
  args: {
    collectedTodayCents: 0,
    collectedByMethod: {},
    streetMoneyCents: 0,
    streetMoneyCount: 0,
    pendingRefundsCents: 0,
    pendingRefundsCount: 0,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Todavía no entró plata hoy.')).toBeVisible()
    await expect(canvas.queryByText('Efectivo')).not.toBeInTheDocument()
  },
}

/**
 * Un solo medio de cobro. El desglose de una sola línea sigue valiendo: dice
 * que todo entró por ahí, que es justo lo que el dueño quiere confirmar.
 */
export const UnSoloMetodo: Story = {
  args: {
    collectedTodayCents: 45_000_00,
    collectedByMethod: { cash: 45_000_00 },
    streetMoneyCents: 0,
    streetMoneyCount: 0,
    pendingRefundsCents: 12_000_00,
    pendingRefundsCount: 1,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Efectivo')).toBeVisible()
    // Singular, no "1 señas".
    await expect(canvas.getByText('1 seña sin devolver')).toBeVisible()
  },
}
