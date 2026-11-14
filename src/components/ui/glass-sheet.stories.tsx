import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { withPortalGlass } from '../../../.storybook/decorators/with-portal-glass'
import { Button } from './button'
import { GlassSheetContent } from './glass-sheet'
import { Sheet, SheetTrigger } from './sheet'

/**
 * La hoja de abajo del portal de vidrio, sobre el `Sheet` de Radix: foco atrapado, Esc, y el foco
 * vuelve al botón que la abrió. En el celu sube desde abajo y se arrastra desde la manija; en la
 * compu es un panel centrado. Mientras está abierta, la barra de abajo baja y sale.
 */
const meta = {
  title: 'Design System/GlassSheet',
  component: GlassSheetContent,
  parameters: { layout: 'fullscreen' },
  decorators: [withPortalGlass()],
  args: { title: 'Filtros' },
  render: (args) => (
    <div className="grid min-h-[480px] place-items-center">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="pill-glass" size="pill">
            Ver filtros
          </Button>
        </SheetTrigger>
        <GlassSheetContent {...args}>
          <p className="text-base text-portal-soft">Elegí el día y el tipo de cancha.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="pill-chip" size="pill-sm" aria-pressed>
              Fútbol 5
            </Button>
            <Button variant="pill-chip" size="pill-sm" aria-pressed={false}>
              Fútbol 7
            </Button>
          </div>
        </GlassSheetContent>
      </Sheet>
    </div>
  ),
} satisfies Meta<typeof GlassSheetContent>

export default meta
type Story = StoryObj<typeof meta>

/** Abre con su título como nombre, el botón de cerrar da 44 px y el foco vuelve al disparador. */
export const Celu: Story = {
  globals: { viewport: { value: 'mobile-primary', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    const trigger = canvas.getByRole('button', { name: 'Ver filtros' })
    await userEvent.click(trigger)
    const dialog = await body.findByRole('dialog', { name: 'Filtros' })
    await expect(dialog).toHaveAttribute('data-glass-sheet')
    // En el celu va pegada abajo, a todo el ancho.
    await waitFor(() =>
      expect(Math.round(dialog.getBoundingClientRect().bottom)).toBe(window.innerHeight),
    )
    const close = body.getByRole('button', { name: 'Cerrar' })
    await expect(close.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    await userEvent.click(close)
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())
    await expect(trigger).toHaveFocus()
  },
}

/** En la compu: panel centrado. Esc la cierra. */
export const Compu: Story = {
  globals: { viewport: { value: 'desktop', isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = within(canvasElement.ownerDocument.body)
    await userEvent.click(canvas.getByRole('button', { name: 'Ver filtros' }))
    const dialog = await body.findByRole('dialog', { name: 'Filtros' })
    await waitFor(() => {
      const r = dialog.getBoundingClientRect()
      return expect(Math.abs(r.left + r.width / 2 - window.innerWidth / 2)).toBeLessThanOrEqual(1)
    })
    await expect(dialog.getBoundingClientRect().bottom).toBeLessThan(window.innerHeight)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull())
  },
}
