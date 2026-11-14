import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, waitFor, within } from 'storybook/test'
import { PlayerBottomNav } from './PlayerBottomNav'
import { PortalSessionProvider } from './PortalSessionProvider'

/**
 * La píldora flotante de abajo del portal de vidrio (decisión 2026-11-13). `fixed` + `md:hidden`:
 * viewport de celu y una caja con containing block propio (`transform`) para no tapar el canvas,
 * con una foto detrás para que el vidrio tenga algo que desenfocar. `usePathname` viene del mock
 * estándar de next/navigation (`parameters.nextjs.navigation`).
 * La activa la marca UNA píldora interior y va en semibold; los ítems dan 54 px de blanco táctil y,
 * sin sesión, la barra aparece igual.
 */
const meta = {
  title: 'Player/PlayerBottomNav',
  component: PlayerBottomNav,
  parameters: { layout: 'fullscreen' },
  globals: { viewport: { value: 'mobile-primary', isRotated: false } },
  decorators: [
    (Story) => (
      <div
        data-portal-glass
        style={{ transform: 'translateZ(0)', height: 180 }}
        className="portal-ambient relative isolate overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- fondo de muestra, sin optimizar */}
        <img
          src="/bg-hero-2.webp"
          alt=""
          className="absolute inset-0 -z-10 h-full w-full object-cover"
        />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlayerBottomNav>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Solo el ítem activo lleva `aria-current` y el semibold; la píldora queda en su lugar (`--i`) y
 * cubre ese ítem. Todos dan 54 px de blanco táctil (66 de barra, menos borde y relleno, como el
 * mockup) y ningún texto baja de 13 px.
 */
async function expectActivo(canvasElement: HTMLElement, activo: string) {
  const links = within(canvasElement).getAllByRole('link')
  const index = links.findIndex((l) => l.textContent === activo)
  await expect(index).toBeGreaterThanOrEqual(0)
  for (const link of links) {
    const esActivo = link.textContent === activo
    await expect(link.getAttribute('aria-current') === 'page').toBe(esActivo)
    await expect(getComputedStyle(link).fontWeight === '600').toBe(esActivo)
    await expect(Math.round(link.getBoundingClientRect().height)).toBe(54)
    await expect(
      parseFloat(getComputedStyle(link.querySelector('span')!).fontSize),
    ).toBeGreaterThanOrEqual(13)
  }
  const pills = canvasElement.querySelectorAll<HTMLElement>('[data-tabbar-pill]')
  await expect(pills).toHaveLength(1)
  const pill = pills[0]!.getBoundingClientRect()
  const item = links[index]!.getBoundingClientRect()
  await expect(Math.abs(pill.left - item.left)).toBeLessThanOrEqual(2)
  await expect(Math.abs(pill.width - item.width)).toBeLessThanOrEqual(2)
}

export const RutaExplorar: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } } },
  play: async ({ canvasElement }) => {
    await expectActivo(canvasElement, 'Explorar')
  },
}

export const RutaMisReservas: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/mis-reservas' } } },
  play: async ({ canvasElement }) => {
    await expectActivo(canvasElement, 'Reservas')
  },
}

export const RutaConfiguracion: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/configuracion' } } },
  play: async ({ canvasElement }) => {
    await expectActivo(canvasElement, 'Cuenta')
  },
}

/** Fuera de las tres secciones (una ficha, por ejemplo) no hay pestaña activa ni píldora. */
export const SinActiva: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/el-vagon' } } },
  play: async ({ canvasElement }) => {
    const links = within(canvasElement).getAllByRole('link')
    for (const link of links) await expect(link).not.toHaveAttribute('aria-current')
    await expect(canvasElement.querySelector('[data-tabbar-pill]')).toBeNull()
  },
}

const withRival: Decorator = (Story) => (
  <PortalSessionProvider
    initialValue={{
      session: null,
      favoriteTenantIds: new Set(),
      staffPanelPath: null,
      rivalEnabled: true,
    }}
  >
    <Story />
  </PortalSessionProvider>
)

/** Con el flag de RIVAL prendido: cuatro ítems y Rival queda activo en `/rival` y sus subrutas. */
export const ConRivalEnRutaRival: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/rival/nuevo' } } },
  decorators: [withRival],
  play: async ({ canvasElement }) => {
    const links = within(canvasElement).getAllByRole('link')
    await expect(links.map((l) => l.textContent)).toEqual([
      'Explorar',
      'Rival',
      'Reservas',
      'Cuenta',
    ])
    await expect(within(canvasElement).getByRole('link', { name: 'Rival' })).toHaveAttribute(
      'href',
      '/rival',
    )
    await expectActivo(canvasElement, 'Rival')
  },
}

/**
 * Una hoja abierta baja la barra (la hoja manda). Oculta también para el teclado y los lectores de
 * pantalla: deja de estar en el árbol de accesibilidad.
 */
export const SeEscondeConUnaHoja: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } } },
  decorators: [
    (Story) => (
      <>
        <Story />
        <div data-glass-sheet data-state="open" hidden />
      </>
    ),
  ],
  play: async ({ canvasElement }) => {
    const nav = canvasElement.querySelector<HTMLElement>('nav[data-bottom-nav]')!
    await expect(getComputedStyle(nav).translate).not.toBe('none')
    await waitFor(() => expect(getComputedStyle(nav).visibility).toBe('hidden'))
    await expect(
      within(canvasElement).queryByRole('navigation', { name: 'Navegación del jugador' }),
    ).toBeNull()
  },
}
