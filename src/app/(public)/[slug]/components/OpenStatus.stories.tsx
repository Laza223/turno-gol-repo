import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { openingHours } from '@/test/fixtures/tenant'
import OpenStatus from './OpenStatus'

/**
 * El reloj de Storybook está congelado el sábado 14-mar-2026 15:30 ART. Antes de hidratar la
 * isla deja una línea vacía; las stories esperan al estado real.
 */
const day = (open: string, close: string) => ({ open, close })
const base = { closedDates: [] as string[], closesNextDay: false }

const meta = {
  title: 'Player/TenantProfile/OpenStatus',
  component: OpenStatus,
  parameters: { layout: 'padded' },
  args: { schedule: { ...base, openingHours: openingHours() } },
  decorators: [
    (Story) => (
      <div className="bg-background p-4 text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OpenStatus>

export default meta
type Story = StoryObj<typeof meta>

export const Abierto: Story = {
  args: { schedule: { ...base, openingHours: openingHours({ sat: day('09:00', '23:00') }) } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Abierto · hasta las 23:00')).toBeVisible()
  },
}

/** Cierra a la 01:00 con día operativo: el artículo es "la", no "las". */
export const CierraALaUna: Story = {
  args: {
    schedule: {
      closedDates: [],
      closesNextDay: true,
      openingHours: openingHours({ sat: day('09:00', '01:00') }),
    },
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Abierto · hasta la 01:00')).toBeVisible()
  },
}

export const TodaviaNoAbrio: Story = {
  args: { schedule: { ...base, openingHours: openingHours({ sat: day('18:00', '23:00') }) } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Cerrado · abre a las 18:00')).toBeVisible()
  },
}

/** Hoy no se atiende en todo el día (feriado o día cerrado): "Cerrado hoy". */
export const CerradoHoy: Story = {
  args: {
    schedule: { openingHours: openingHours(), closedDates: ['2026-03-14'], closesNextDay: false },
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Cerrado hoy')).toBeVisible()
  },
}

/** Ya cerró por hoy (15:30, cierra 12:00): dice cuándo vuelve a abrir. */
export const YaCerro: Story = {
  args: {
    schedule: {
      ...base,
      openingHours: openingHours({ sat: day('09:00', '12:00'), sun: day('10:00', '23:00') }),
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Cerró por hoy · abre mañana a las 10:00'),
    ).toBeVisible()
  },
}

/** Mañana también es feriado: nombra el próximo día que abre. */
export const YaCerroAbreElLunes: Story = {
  args: {
    schedule: {
      closedDates: ['2026-03-15'],
      closesNextDay: false,
      openingHours: openingHours({ sat: day('09:00', '12:00'), mon: day('09:30', '23:00') }),
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Cerró por hoy · abre el lunes a las 09:30'),
    ).toBeVisible()
  },
}
