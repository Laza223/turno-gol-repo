import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PlayerBottomNav } from '@/components/site/PlayerBottomNav'
import { PortalSessionProvider } from '@/components/site/PortalSessionProvider'
import { pendingAction } from '@/test/pending-action'
import ConfirmBookingButton from './ConfirmBookingButton'

/**
 * `action` entra por prop (ver el comentario en CheckoutFlow). `../actions` es `'use server'` y
 * arrastra `request-context` → `node:async_hooks`, que Vite externaliza en el browser y rompe la
 * story si se importa como valor. Debajo de `md` el botón es una barra fija abajo: se ve de verdad
 * en un viewport de celular (las capturas a 320, 375 y 390).
 */
const meta = {
  title: 'Player/Checkout/ConfirmBookingButton',
  component: ConfirmBookingButton,
  parameters: { layout: 'fullscreen' },
  args: {
    slug: 'complejo-fenix',
    court: '00000000-0000-4000-8000-000000000101',
    date: '2026-03-14',
    time: '18:00',
    dur: 60,
    formato: 5,
    pay: null,
    label: 'Reservar',
  },
  decorators: [
    (Story) => (
      <div className="min-h-dvh bg-background px-4 py-4 text-foreground">
        <div className="mx-auto max-w-[35rem]">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof ConfirmBookingButton>

export default meta
type Story = StoryObj<typeof meta>

/** Sin seña: "Reservar", y la reserva queda confirmada al instante. */
export const SinSena: Story = {
  args: { action: fn(async () => undefined) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Reservar' })).toBeEnabled()
  },
}

/** Con seña: el botón dice lo que hace, "Pagar seña" (con el monto si el complejo muestra precios). */
export const ConSena: Story = {
  args: { label: 'Pagar seña · $ 6.000', action: fn(async () => undefined) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: /^Pagar seña/ })).toBeEnabled()
  },
}

/** Los datos que viajan al servidor: el turno, el filtro de formato y el `pay` de un link viejo. */
export const QueViaja: Story = {
  args: { pay: 'transfer', action: fn(async () => undefined) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Reservar' }))
    const sent = (args.action as ReturnType<typeof fn>).mock.calls[0]![0] as FormData
    await expect(Object.fromEntries(sent.entries())).toEqual({
      slug: 'complejo-fenix',
      court: '00000000-0000-4000-8000-000000000101',
      date: '2026-03-14',
      time: '18:00',
      dur: '60',
      formato: '5',
      pay: 'transfer',
    })
  },
}

const procesando = pendingAction<void>(undefined)

/** Pendiente: "Procesando…" y deshabilitado, un solo envío. */
export const Pendiente: Story = {
  args: { label: 'Pagar seña', action: fn(procesando.action) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^Pagar seña/ }))
    const pending = await canvas.findByRole('button', { name: /procesando/i })
    await expect(pending).toBeDisabled()
    // Última story que usa `procesando`: se libera para no dejar viva la transición.
    await procesando.release(pending)
  },
}

/**
 * Con sesión del jugador hay barra inferior en el celular: el botón fijo se sube por encima de
 * ella (misma medida que reserva `PortalFrame`) y las dos quedan a la vista.
 */
export const ConBarraInferior: Story = {
  args: { action: fn(async () => undefined) },
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/complejo-fenix/reservar' } },
  },
  decorators: [
    (Story) => (
      <PortalSessionProvider
        initialValue={{
          session: {
            playerId: 'p1',
            firstName: 'Tomás',
            lastName: 'Ibáñez',
            avatarUrl: null,
            email: 'tomas@example.com',
          },
          favoriteTenantIds: new Set(),
          staffPanelPath: null,
        }}
      >
        <Story />
        <PlayerBottomNav />
      </PortalSessionProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument
    const button = within(canvasElement).getByRole('button', { name: 'Reservar' })
    const nav = doc.querySelector('nav[aria-label="Navegación del jugador"]')
    await expect(nav).not.toBeNull()
    // Solo tiene sentido medir el apilado donde la barra inferior existe (debajo de md).
    if (getComputedStyle(nav!).display === 'none') return
    const b = button.getBoundingClientRect()
    const n = nav!.getBoundingClientRect()
    await expect(b.bottom).toBeLessThanOrEqual(n.top)
  },
}
