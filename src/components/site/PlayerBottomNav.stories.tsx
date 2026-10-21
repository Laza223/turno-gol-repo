import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, within } from 'storybook/test'
import { PlayerBottomNav } from './PlayerBottomNav'

/**
 * `fixed inset-x-0 bottom-0` + `md:hidden`: viewport mobile fijo, contenido
 * en una caja con containing block propio para no tapar el canvas. `usePathname`
 * viene del mock estándar de next/navigation (parameters.nextjs.navigation).
 * Plana: el ítem activo va en verde, semibold y con una marca `primary` de 2 px arriba del
 * ícono; los tres ítems miden 56 px o más y, sin sesión, la barra aparece igual.
 */
const meta = {
  title: 'Player/PlayerBottomNav',
  component: PlayerBottomNav,
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile-primary' },
  },
  decorators: [
    (Story) => (
      <div
        style={{ transform: 'translateZ(0)', height: 90 }}
        className="relative isolate overflow-hidden"
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlayerBottomNav>

export default meta
type Story = StoryObj<typeof meta>

/** Solo el ítem activo lleva la marca y el semibold; el resto no, y todos dan 56 px de blanco táctil. */
async function expectActivo(canvasElement: HTMLElement, activo: string) {
  const links = within(canvasElement).getAllByRole('link')
  await expect(links).toHaveLength(3)
  for (const link of links) {
    const esActivo = link.textContent === activo
    await expect(link.querySelector('span[aria-hidden="true"].bg-primary') !== null).toBe(esActivo)
    await expect(getComputedStyle(link).fontWeight === '600').toBe(esActivo)
    await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(56)
    // Piso tipográfico del portal: nada baja de 13 px.
    await expect(
      parseFloat(getComputedStyle(link.querySelector('span:not([aria-hidden])')!).fontSize),
    ).toBeGreaterThanOrEqual(13)
  }
}

export const RutaExplorar: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Explorar' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expectActivo(canvasElement, 'Explorar')
  },
}

export const RutaMisReservas: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/mis-reservas' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Reservas' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expectActivo(canvasElement, 'Reservas')
  },
}

export const RutaConfiguracion: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/configuracion' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Cuenta' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expectActivo(canvasElement, 'Cuenta')
  },
}
