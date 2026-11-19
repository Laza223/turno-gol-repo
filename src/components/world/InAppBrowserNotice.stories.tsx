import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { PortalAuthFrame } from '@/components/world/PortalAuthFrame'
import { paintedContrast } from '@/test/contrast'
import { InAppBrowserNotice } from './InAppBrowserNotice'

/**
 * El botón de Google del navegador interno de una app, sobre el marco de /ingresar (portal de
 * vidrio). En un celular de 390 px, el ancho donde llega el jugador desde Instagram. En Storybook
 * el User-Agent es el de Chrome: el salto no tiene plataforma y no navega (si no, la story se
 * iría de la página); lo que se ve es lo que queda cuando el teléfono no abre el navegador.
 */
const meta = {
  title: 'Auth/InAppBrowserNotice',
  component: InAppBrowserNotice,
  parameters: { layout: 'fullscreen' },
  args: { glass: true },
  globals: { viewport: { value: 'celular390', isRotated: false } },
  decorators: [
    (Story) => (
      <PortalAuthFrame signOutAction={async () => {}}>
        <Story />
      </PortalAuthFrame>
    ),
  ],
} satisfies Meta<typeof InAppBrowserNotice>

export default meta
type Story = StoryObj<typeof meta>

/** En reposo: el botón llega a 44 px de alto y dice qué va a pasar, con 4,5:1. */
export const Reposo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: 'Continuar con Google' })
    await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    const help = canvas.getByText('Te abrimos tu navegador para que entres con Google.')
    await expect(await paintedContrast(help)).toBeGreaterThanOrEqual(4.5)
  },
}

/** Tocado y sin que el teléfono abra nada: manda al email, sin pedir copiar ni buscar menús. */
export const NoSeAbrio: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Continuar con Google' }))
    const help = await canvas.findByText('Si no se abrió tu navegador, entrá con tu email.')
    await expect(await paintedContrast(help)).toBeGreaterThanOrEqual(4.5)
    await expect(canvas.queryByRole('button', { name: /copiar/i })).toBeNull()
  },
}
