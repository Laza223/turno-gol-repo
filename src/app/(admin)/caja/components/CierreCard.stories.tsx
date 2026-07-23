import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { dailyCashClose } from '@/test/fixtures'
import { CierreCard } from './CierreCard'

/** Peak-end artifact: vive suelto sobre `bg-background` en caja/page.tsx, sin card wrapper propio (el component define su propia superficie emerald). */
const meta = {
  title: 'Admin/Caja/CierreCard',
  component: CierreCard,
  parameters: { layout: 'padded' },
  args: { close: dailyCashClose() },
} satisfies Meta<typeof CierreCard>

export default meta
type Story = StoryObj<typeof meta>

/** Efectivo contado con diferencia respecto del saldo — el caso por defecto de la fixture. */
export const ConDiferencia: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Caja cerrada — con diferencia anotada')).toBeVisible()
    await expect(canvas.getByText(/diferencia de/i)).toBeVisible()
    await expect(canvas.getByText(/faltaron \$500/i)).toBeVisible()
  },
}

export const EfectivoCuadro: Story = {
  args: {
    close: dailyCashClose({ declaredCash: 3700000, diffAmount: 0, note: null }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Caja cerrada — el efectivo cuadró')).toBeVisible()
    await expect(canvas.queryByText(/diferencia de/i)).not.toBeInTheDocument()
  },
}

/** Cierre sin arqueo declarado (declaredCash=0 y diff=balance): no hay alarma falsa. */
export const SinEfectivoContado: Story = {
  args: {
    close: dailyCashClose({ declaredCash: 0, diffAmount: 3700000, note: null }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Caja cerrada')).toBeVisible()
    await expect(canvas.queryByText('Efectivo contado')).not.toBeInTheDocument()
    await expect(canvas.queryByText(/diferencia de/i)).not.toBeInTheDocument()
  },
}

export const BalanceNegativo: Story = {
  args: {
    close: dailyCashClose({
      totalIncome: 500000,
      totalExpense: 800000,
      balance: -300000,
      declaredCash: -300000,
      diffAmount: 0,
      note: null,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('−$ 3.000,00')).toBeVisible()
  },
}

// ── v2 (migr. 049): cierres con apertura — expectedCash/openingCash no-null ──

/** v2 con fondo y arqueo exacto: filas nuevas del <dl> visibles. */
export const V2CuadroConFondo: Story = {
  args: {
    close: dailyCashClose({
      openingCash: 300000,
      expectedCash: 2300000,
      declaredCash: 2300000,
      diffAmount: 0,
      note: null,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Caja cerrada — el efectivo cuadró')).toBeVisible()
    await expect(canvas.getByText('Fondo inicial')).toBeVisible()
    await expect(canvas.getByText('Efectivo esperado')).toBeVisible()
    await expect(canvas.getByText('Efectivo contado')).toBeVisible()
  },
}

/** v2 sobrante: título honesto con dirección + fila Diferencia con signo +. */
export const V2Sobraron: Story = {
  args: {
    close: dailyCashClose({
      openingCash: 300000,
      expectedCash: 2300000,
      declaredCash: 2400000,
      diffAmount: 100000,
      note: 'Cobré un fiado viejo en efectivo.',
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/Caja cerrada — sobraron/)).toBeVisible()
    await expect(canvas.getByText('Diferencia')).toBeVisible()
  },
}

/** v2 sin arqueo (declared=0): muestra fondo/esperado pero sin contado/diferencia. */
export const V2SinArqueo: Story = {
  args: {
    close: dailyCashClose({
      openingCash: 300000,
      expectedCash: 2300000,
      declaredCash: 0,
      diffAmount: -2300000,
      note: null,
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Caja cerrada — sin arqueo declarado')).toBeVisible()
    await expect(canvas.getByText('Efectivo esperado')).toBeVisible()
    await expect(canvas.queryByText('Efectivo contado')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Diferencia')).not.toBeInTheDocument()
  },
}
