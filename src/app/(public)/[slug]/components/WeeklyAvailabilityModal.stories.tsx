import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { publicTenant, todayArt } from '@/test/fixtures/public'
import WeeklyAvailabilityModal from './WeeklyAvailabilityModal'

const HOY = todayArt()

function masDias(dateStr: string, n: number): string {
  const dt = new Date(`${dateStr}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

/**
 * Modal de disponibilidad semanal del perfil público.
 *
 * Acá va SOLO el estado de error. La semana cargada es el mismo listado que
 * `WeeklyAvailability.stories.tsx` ya mide; lo que no medía nadie era este
 * camino, que aparece recién cuando `/api/public/availability/week` falla —
 * o sea que axe nunca lo veía.
 */
const meta = {
  title: 'Player/TenantProfile/WeeklyAvailabilityModal',
  component: WeeklyAvailabilityModal,
  parameters: {
    layout: 'centered',
    nextjs: { appDirectory: true, navigation: { pathname: '/complejo-fenix' } },
  },
  args: {
    isOpen: true,
    onClose: fn(),
    tenant: publicTenant(),
    selectedDate: HOY,
    onSelectDate: fn(),
    today: HOY,
    maxDate: masDias(HOY, 6),
  },
} satisfies Meta<typeof WeeklyAvailabilityModal>

export default meta
type Story = StoryObj<typeof meta>

/**
 * El endpoint de la semana falla: se avisa en vez de dejar el esqueleto
 * girando, y no se muestra una semana vacía como si no hubiera canchas.
 */
export const ErrorDeCarga: Story = {
  parameters: {
    fetchMock: [{ match: '/api/public/availability/week', json: {}, status: 500 }],
  },
  play: async ({ canvasElement }) => {
    // El diálogo va a un portal fuera del canvas.
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByText(/error al cargar la disponibilidad/i)).toBeTruthy()
  },
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
export const ErrorDeCargaOscuro: Story = {
  ...ErrorDeCarga,
  globals: { theme: 'dark' },
}
