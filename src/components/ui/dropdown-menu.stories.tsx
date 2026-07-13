import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { MoreVertical } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'

/**
 * @radix-ui/react-dropdown-menu puro. Reproduce QuickActions.tsx (acciones
 * rápidas de una reserva en la lista de /reservas): trigger icon-only con
 * `MoreVertical` + items de texto, uno de ellos `disabled`.
 *
 * Radix DropdownMenu es modal por default: mientras está abierto, aria-oculta
 * el resto del árbol (incluido el propio trigger, que sigue siendo focusable
 * en el DOM) — mismo comportamiento confirmado en StaffActions.stories.tsx.
 * Cerrar con Escape al final de cada play() evita que el scan de a11y
 * (afterEach) capture ese estado transitorio como si fuera el render final.
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

/** Abierto por click real (no `defaultOpen`: ver nota de aria-hidden-focus arriba). */
export const Abierto: Story = {
  render: () => (
    <DropdownMenu>
      <Menu />
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Más acciones' }))

    // waitFor: recién montado, el fade-in-0 de Radix puede dejar opacity:0 en
    // el primer tick y toBeVisible() lo agarra en falso negativo.
    const body = within(canvasElement.ownerDocument.body)
    await waitFor(() => expect(body.getByRole('menu')).toBeVisible())

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('menu')).not.toBeInTheDocument())
  },
}

export const ConItemDeshabilitado: Story = {
  render: () => (
    <DropdownMenu>
      <Menu disabledItem />
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Más acciones' }))

    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('menuitem', { name: 'Confirmar pago' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('menu')).not.toBeInTheDocument())
  },
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
    await waitFor(() => expect(within(menu).getByRole('menuitem', { name: 'Completar' })).toBeVisible())

    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(body.queryByRole('menu')).not.toBeInTheDocument())
  },
}
