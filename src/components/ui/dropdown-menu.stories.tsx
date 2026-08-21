import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'

/**
 * @radix-ui/react-dropdown-menu puro. Reproduce QuickActions.tsx (acciones
 * rápidas de una reserva en la lista de /reservas): trigger icon-only con
 * `MoreVertical` + items de texto, uno de ellos `disabled`.
 *
 * Las stories usan `modal={false}`, igual que LOS CINCO consumidores reales del repo
 * (StaffActions, QuickActions, ShareButton, HeroSearch, SearchBar). No es una
 * concesión al test: es el uso real.
 *
 * El default de Radix (`modal=true`) llama `hideOthers()` y marca aria-hidden todo el
 * árbol fuera del portal —incluido el propio trigger, que sigue siendo focuseable—,
 * lo que viola `aria-hidden-focus`. Es correcto para un menú que de verdad bloquea la
 * página, pero ninguno de los menús de esta app lo es: son menús de acciones.
 *
 * Las stories dejan el menú ABIERTO cuando terminan, a propósito: el scan de axe corre
 * después del play y tiene que ver el estado abierto, que es donde vivía la violación.
 * (Antes había un `{Escape}` al final para cerrarlo; eso no arreglaba nada, solo le
 * escondía el bug al scanner.)
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
        <DropdownMenuItem className="text-red-700 focus:text-red-700 dark:text-red-300 dark:focus:text-red-300">
          Cancelar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </>
  )
}

export const Cerrado: Story = {
  render: () => (
    <DropdownMenu modal={false}>
      <Menu />
    </DropdownMenu>
  ),
}

/** Abierto por click real (no `defaultOpen`: ver nota de aria-hidden-focus arriba). */
export const Abierto: Story = {
  render: () => (
    <DropdownMenu modal={false}>
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
  },
}

export const ConItemDeshabilitado: Story = {
  render: () => (
    <DropdownMenu modal={false}>
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
  },
}

export const AbrirConTeclado: Story = {
  render: () => (
    <DropdownMenu modal={false} onOpenChange={fn()}>
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
    await waitFor(() =>
      expect(within(menu).getByRole('menuitem', { name: 'Completar' })).toBeVisible(),
    )
  },
}
