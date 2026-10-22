import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PortalAuthFrame } from '@/components/world/PortalAuthFrame'
import { paintedContrast } from '@/test/contrast'
import { InAppBrowserNotice } from './InAppBrowserNotice'

/**
 * El aviso que va en lugar de "Continuar con Google" en el navegador interno de una app, sobre el
 * marco de /ingresar (siempre oscuro). En un celular de 390 px, el ancho donde llega el jugador
 * desde Instagram. El portapapeles se reemplaza en cada story: el del navegador de las pruebas
 * pide permiso.
 */
const meta = {
  title: 'Auth/InAppBrowserNotice',
  component: InAppBrowserNotice,
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'celular390', isRotated: false } },
  decorators: [
    (Story) => (
      <PortalAuthFrame>
        <Story />
      </PortalAuthFrame>
    ),
  ],
} satisfies Meta<typeof InAppBrowserNotice>

export default meta
type Story = StoryObj<typeof meta>

const setClipboard = (writeText: (text: string) => Promise<void>) =>
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

/** En reposo: el botón llega a 44 px de alto y la ayuda se lee con 4,5:1. Nada anunciado. */
export const Reposo: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button', { name: 'Copiar enlace' })
    await expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    const help = canvas.getByText(/No funciona dentro de esta app\./)
    await expect(help).toHaveTextContent(
      'No funciona dentro de esta app. Tocá los tres puntos arriba a la derecha y elegí abrir en el navegador. O copiá el enlace y pegalo en Chrome o Safari.',
    )
    await expect(await paintedContrast(help)).toBeGreaterThanOrEqual(4.5)
    await expect(canvas.queryByRole('status')).toBeNull()
  },
}

/** Copia la página tal cual (con el turno elegido) y dice dónde pegarla. */
export const Copiado: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const writeText = fn(async () => {})
    setClipboard(writeText)
    await userEvent.click(canvas.getByRole('button', { name: 'Copiar enlace' }))
    await expect(await canvas.findByRole('status')).toHaveTextContent(
      'Enlace copiado. Pegalo en Chrome o Safari.',
    )
    await expect(writeText).toHaveBeenCalledWith(window.location.href)
  },
}

/** La app no deja copiar: manda al menú de los tres puntos, que siempre está. */
export const NoSePudoCopiar: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    setClipboard(fn(async () => Promise.reject(new Error('NotAllowedError'))))
    await userEvent.click(canvas.getByRole('button', { name: 'Copiar enlace' }))
    await expect(await canvas.findByRole('status')).toHaveTextContent(
      'No se pudo copiar. Usá los tres puntos de arriba a la derecha.',
    )
  },
}
