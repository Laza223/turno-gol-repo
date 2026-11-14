import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, waitFor, within } from 'storybook/test'
import { Badge } from '@/components/ui/badge'
import { GlassSheetContent } from '@/components/ui/glass-sheet'
import { Sheet } from '@/components/ui/sheet'
import { PlayerBottomNav } from './PlayerBottomNav'
import PortalHeader from './PortalHeader'
import { PortalSessionProvider } from './PortalSessionProvider'

const PHOTOS = ['/bg-hero-2.webp', '/bg-how-it-works.webp', '/bg-owner.webp', '/hero-bg.webp']

/**
 * Banco de prueba del presupuesto de vidrio (plan F1, paso 8): la cabecera, la barra de abajo, ocho
 * tarjetas y, si se pide, una hoja abierta, con fotos pasando por detrás. Sirve para medir el scroll
 * con la CPU frenada 4× y decidir si las listas van en vidrio real o pintado. El resultado está en
 * "Gotchas" del plan (`docs/planning/2026-11-13-portal-vidrio-plan.md`).
 */
function Bench({ painted, sheet }: { painted: boolean; sheet: boolean }) {
  return (
    <PortalSessionProvider
      initialValue={{ session: null, favoriteTenantIds: new Set(), staffPanelPath: null }}
    >
      <div data-portal-glass className="portal-ambient min-h-dvh pb-(--portal-tabbar-space)">
        <PortalHeader variant="solid" signOutAction={fn(async () => {})} />
        <main className="mx-auto grid max-w-xl gap-4 px-4 py-6">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="relative isolate">
              {/* eslint-disable-next-line @next/next/no-img-element -- fondo de muestra */}
              <img
                src={PHOTOS[i % PHOTOS.length]}
                alt=""
                className="absolute inset-x-0 -top-6 -z-10 h-40 w-full rounded-3xl object-cover"
              />
              <article
                data-bench-card
                className={`${painted ? 'glass-painted' : 'glass'} grid gap-2 rounded-3xl p-5 text-portal-ink`}
              >
                <h2 className="font-display text-xl font-bold">Complejo {i + 1}</h2>
                <p className="text-base text-portal-soft">Fútbol 5 y 7, a 2 km.</p>
                <div className="flex gap-2">
                  <Badge variant="glass">Libre</Badge>
                  <Badge variant="glass-neutral">Hoy 20:00</Badge>
                </div>
              </article>
            </div>
          ))}
        </main>
        <PlayerBottomNav />
        {sheet && (
          <Sheet open modal={false}>
            <GlassSheetContent title="Filtros">
              <p className="text-base text-portal-soft">Elegí el día y el tipo de cancha.</p>
            </GlassSheetContent>
          </Sheet>
        )}
      </div>
    </PortalSessionProvider>
  )
}

const meta = {
  title: 'Player/Banco de vidrio',
  component: Bench,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true, navigation: { pathname: '/explorar' } },
  },
  globals: { viewport: { value: 'mobile-primary', isRotated: false } },
  args: { painted: false, sheet: false },
} satisfies Meta<typeof Bench>

export default meta
type Story = StoryObj<typeof meta>

/** Ocho tarjetas de vidrio real: cabecera, barra y tarjetas desenfocan a la vez. */
export const VidrioReal: Story = {
  play: async ({ canvasElement }) => {
    const cards = canvasElement.querySelectorAll('[data-bench-card]')
    await expect(cards).toHaveLength(8)
    await expect(getComputedStyle(cards[0]!).backdropFilter).toContain('blur')
  },
}

/** Las mismas ocho en vidrio pintado: sin desenfoque, el relleno hace de vidrio. */
export const VidrioPintado: Story = {
  args: { painted: true },
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector('[data-bench-card]')!
    await expect(getComputedStyle(card).backdropFilter).toBe('none')
  },
}

/** Con una hoja abierta: la barra de abajo baja y sale. */
export const ConHoja: Story = {
  args: { sheet: true },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body)
    const dialog = await body.findByRole('dialog', { name: 'Filtros' })
    // Con "reducir movimiento" la hoja entra con un fundido de 150 ms.
    await waitFor(() => expect(dialog).toBeVisible())
  },
}
