import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import { ImpersonationBanner } from './impersonation-banner'

/**
 * `action` entra por prop (ver el comentario en impersonation-banner.tsx): el
 * módulo real (`super-admin/tenants/[id]/actions.ts`) es `'use server'` y
 * arrastra drizzle/postgres + `node:async_hooks`, que rompe el bundle de
 * browser de Storybook si se importa como valor.
 *
 * `sticky top-[...]`: en la app vive pegado bajo el header fijo (spec §6). Acá
 * alcanza con un contenedor `relative` normal — `sticky` no necesita el truco
 * de containing-block que sí hace falta para `fixed`.
 */
const meta = {
  title: 'SuperAdmin/ImpersonationBanner',
  component: ImpersonationBanner,
  parameters: { layout: 'fullscreen' },
  args: {
    tenantName: 'Complejo Fénix',
    action: fn(async () => {}),
  },
} satisfies Meta<typeof ImpersonationBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/Impersonando Complejo Fénix/)
    await expect(
      canvas.getByRole('button', { name: /salir de impersonación/i }),
    ).toBeInTheDocument()
  },
}

/** Nombre de tenant largo: el banner no debe romper su layout de una línea. */
export const NombreLargo: Story = {
  args: { tenantName: 'Polideportivo y Complejo Deportivo Municipal Belgrano Sur' },
}
