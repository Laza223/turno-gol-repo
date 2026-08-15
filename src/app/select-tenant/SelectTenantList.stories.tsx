import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { staffTenantRow, staffTenantRows } from '@/test/fixtures/tenant'
import { SelectTenantList } from './SelectTenantList'

/**
 * `selectTenantAction` es un Server Action real (`'use server'`) — se inyecta
 * como prop `action`, nunca se importa como valor (ver regla 1 del brief:
 * arrastra `request-context` → `node:async_hooks`).
 */
const meta = {
  title: 'Auth/SelectTenant/SelectTenantList',
  component: SelectTenantList,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SelectTenantList>

export default meta
type Story = StoryObj<typeof meta>

/** Caso real que justifica la página: staff con acceso a 3 complejos. */
export const Default: Story = {
  args: { tenants: staffTenantRows(), action: fn(async () => ({ status: 'idle' as const })) },
}

/** Un solo tenant — caso límite: en la app real `resolveStaffTenants` con 1 resultado
 * nunca llega acá (el login setea el claim directo), pero la lista no debe romperse. */
export const UnComplejo: Story = {
  args: { tenants: [staffTenantRow()], action: fn(async () => ({ status: 'idle' as const })) },
}

/** `?error=invalid` — tenantId manipulado a mano o el staff ya no pertenece a ese tenant. */
export const ErrorSeleccionInvalida: Story = {
  args: { tenants: staffTenantRows(), error: 'invalid', action: fn(async () => ({ status: 'idle' as const })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      'No pudimos seleccionar ese complejo.',
    )
  },
}

/** Clic en un complejo dispara el submit del form (la Server Action recibe el tenantId). */
export const Seleccion: Story = {
  args: { tenants: staffTenantRows(), action: fn(async () => ({ status: 'idle' as const })) },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Canchas del Sur/ }))
    await expect(args.action).toHaveBeenCalledTimes(1)
  },
}
