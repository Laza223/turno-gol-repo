import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import {
  availabilityResponse,
  availabilityResponseNoCourts,
  availabilityResponseNoSlots,
  availabilityResponseWithHold,
  publicTenant,
  publicTenantNoOnlineBooking,
} from '@/test/fixtures/public'
import AvailabilityGrid from './AvailabilityGrid'

/** En el perfil vive dentro de la card blanca principal (`page.tsx`, `space-y-7`), como último bloque. */
const meta = {
  title: 'Player/TenantProfile/AvailabilityGrid',
  component: AvailabilityGrid,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/complejo-fenix' } },
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-3xl border border-border bg-card p-4 shadow-xs sm:p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AvailabilityGrid>

export default meta
type Story = StoryObj<typeof meta>

/** Grilla con las 5 variantes de slot (libre/ocupado/fijo/bloqueado/pasado) + leyenda. */
export const Default: Story = {
  args: { tenant: publicTenant() },
  parameters: {
    fetchMock: [{ match: '/api/public/availability', json: availabilityResponse() }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      (await canvas.findAllByRole('link', { name: /^Reservar/ })).length,
    ).toBeGreaterThan(0)
    // "Turno fijo"/"Bloqueado" aparecen 2 veces c/u: en la celda del slot y en la leyenda.
    await expect(canvas.getAllByText('Turno fijo').length).toBeGreaterThan(1)
    await expect(canvas.getAllByText('Bloqueado').length).toBeGreaterThan(1)
  },
}

/** El fetch de disponibilidad falla: la grilla del día anterior no se pisa, se muestra el error. */
export const ErrorDeCarga: Story = {
  args: { tenant: publicTenant() },
  parameters: {
    fetchMock: [{ match: '/api/public/availability', json: {}, status: 500 }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('alert')).toHaveTextContent(/no pudimos cargar/i)
  },
}

/** El complejo todavía no tiene canchas online. */
export const SinCanchas: Story = {
  args: { tenant: publicTenant() },
  parameters: {
    fetchMock: [{ match: '/api/public/availability', json: availabilityResponseNoCourts() }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('Este complejo no tiene canchas disponibles por el momento.'),
    ).toBeInTheDocument()
  },
}

/** Día cerrado / fuera de horario: hay canchas pero ningún turno generado. */
export const SinTurnosParaLaFecha: Story = {
  args: { tenant: publicTenant() },
  parameters: {
    fetchMock: [{ match: '/api/public/availability', json: availabilityResponseNoSlots() }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Sin turnos para esta fecha.')).toBeInTheDocument()
  },
}

/** allowOnlineBooking=false: los turnos libres muestran "Contactar" (tel:) en vez de "Reservar". */
export const SinReservaOnline: Story = {
  args: { tenant: publicTenantNoOnlineBooking() },
  parameters: {
    fetchMock: [{ match: '/api/public/availability', json: availabilityResponse() }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findAllByRole('link', { name: /contactar/i })).not.toHaveLength(0)
    await expect(canvas.queryByRole('link', { name: /^Reservar/ })).not.toBeInTheDocument()
  },
}

/** Con 2+ canchas aparece el filtro; elegir una cancha reduce la grilla a esa columna. */
export const FiltroPorCancha: Story = {
  args: { tenant: publicTenant() },
  parameters: {
    fetchMock: [{ match: '/api/public/availability', json: availabilityResponse() }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const group = within(await canvas.findByRole('group', { name: 'Filtrar por cancha' }))
    await userEvent.click(group.getByRole('button', { name: 'Cancha 2' }))
    await expect(group.getByRole('button', { name: 'Cancha 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(canvas.queryByRole('columnheader', { name: 'Cancha 1' })).not.toBeInTheDocument()
  },
}

/**
 * B15 — otro jugador está pagando la seña AHORA.
 *
 * Antes esto se renderizaba "Ocupado", idéntico a una cancha vendida: el
 * jugador se iba a otro complejo sin saber que en unos minutos podía quedar
 * libre. Ahora dice cuánto falta, y NO es clickeable (el hold retiene la cancha
 * de verdad hasta que expira).
 */
export const SlotSenandoOtroJugador: Story = {
  args: { tenant: publicTenant() },
  parameters: {
    fetchMock: [{ match: '/api/public/availability', json: availabilityResponseWithHold() }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/^Señando \d+:\d{2}$/)).toBeVisible()
    // Lo que importa del cambio: NO dice "Ocupado" en ese slot, y no se puede
    // clickear para reservarlo.
    const senando = await canvas.findByText(/^Señando/)
    await expect(senando.closest('a')).toBeNull()
  },
}

/** Vencido por reloj: se está liberando, pero todavía no se promete "libre". */
export const SlotHoldVencido: Story = {
  args: { tenant: publicTenant() },
  parameters: {
    fetchMock: [{ match: '/api/public/availability', json: availabilityResponseWithHold() }],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const liberando = await canvas.findByText('Liberando…')
    await expect(liberando).toBeVisible()
    // Sigue sin ser un link: la fila todavía bloquea el exclusion constraint.
    await expect(liberando.closest('a')).toBeNull()
  },
}
