import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { MoreVertical } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'

/**
 * @radix-ui/react-dropdown-menu puro. Reproduce QuickActions.tsx (acciones
 * rápidas de una reserva en la lista de /reservas): trigger icon-only con
 * `MoreVertical` + items de texto, uno de ellos `disabled`.
 */
const meta = {
  title: 'Design System/DropdownMenu',
  component: DropdownMenu,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof DropdownMenu>

export default meta
type Story = StoryObj<typeof meta>

function Menu({ disabledItem = false }: { disabledItem?: boolean }) {
  return (
    <>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Más acciones"
          className="inline-flex h-11 w-11 md:h-10 md:w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <MoreVertical className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>Completar</DropdownMenuItem>
        <DropdownMenuItem>Marcar ausente</DropdownMenuItem>
        <DropdownMenuItem disabled={disabledItem}>Confirmar pago</DropdownMenuItem>
        <DropdownMenuItem className="text-destructive focus:text-destructive">Cancelar</DropdownMenuItem>
      </DropdownMenuContent>
    </>
  )
}

export const Cerrado: Story = {
  render: () => (
    <DropdownMenu>
      <Menu />
    </DropdownMenu>
  ),
}

/** `defaultOpen` (Radix, sin estado controlado) para mostrar el panel directamente. */
export const Abierto: Story = {
  render: () => (
    <DropdownMenu defaultOpen>
      <Menu />
    </DropdownMenu>
  ),
}

export const ConItemDeshabilitado: Story = {
  render: () => (
    <DropdownMenu defaultOpen>
      <Menu disabledItem />
    </DropdownMenu>
  ),
}

export const AbrirConTeclado: Story = {
  render: () => (
    <DropdownMenu onOpenChange={fn()}>
      <Menu />
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button', { name: 'Más acciones' })
    trigger.focus()
    await userEvent.keyboard('{Enter}')

    const body = within(canvasElement.ownerDocument.body)
    const menu = await body.findByRole('menu')
    await expect(within(menu).getByRole('menuitem', { name: 'Completar' })).toBeVisible()
  },
}
