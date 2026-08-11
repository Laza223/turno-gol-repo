import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible'

/**
 * @radix-ui/react-collapsible puro, usado para progressive disclosure (Fase 3
 * UX): separa campos secundarios de un form largo bajo un trigger ("Opciones
 * avanzadas") colapsado por defecto. `CollapsibleContent` anima con
 * accordion-down/up (globals.css, 0.2s) y respeta `prefers-reduced-motion`
 * (`motion-reduce:animate-none`, mismo idiom que ui/tooltip.tsx).
 */
const meta = {
  title: 'Design System/Collapsible',
  component: Collapsible,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Collapsible>

export default meta
type Story = StoryObj<typeof meta>

function Demo() {
  return (
    <Collapsible className="w-72">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring">
        Opciones avanzadas
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-3">
        <p className="text-sm text-muted-foreground">Contenido secundario, oculto por defecto.</p>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Colapsado por defecto (comportamiento real en los forms que lo usan).
 * OJO: el contenido queda EN el DOM (forceMount, display:none) a propósito —
 * los inputs con name= deben serializar en FormData aunque estén colapsados.
 * Por eso se asserta visibilidad, no presencia.
 */
export const Cerrado: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Contenido secundario, oculto por defecto.')).not.toBeVisible()
  },
}

/** Click en el trigger despliega el contenido; un segundo click lo vuelve a colapsar. */
export const AbrirYCerrarPorClick: Story = {
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: 'Opciones avanzadas' })

    await userEvent.click(trigger)
    await waitFor(() =>
      expect(canvas.getByText('Contenido secundario, oculto por defecto.')).toBeVisible(),
    )
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(trigger)
    await waitFor(() =>
      expect(canvas.getByText('Contenido secundario, oculto por defecto.')).not.toBeVisible(),
    )
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  },
}
