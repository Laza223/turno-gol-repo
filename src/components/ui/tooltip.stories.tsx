import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Lock } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

/**
 * @radix-ui/react-tooltip con el `Provider` embebido en cada `Tooltip` (no
 * hace falta uno global). Caso real: botón icon-only con tooltip explicativo
 * (MASTER §7.4 — obligatorio en icon-only). El tooltip complementa el
 * `aria-label` del trigger, no lo reemplaza.
 */
const meta = {
  title: 'Design System/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tooltip>

export default meta
type Story = StoryObj<typeof meta>

function IconButton() {
  return (
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label="Solo el admin puede editar Configuración"
        className="inline-flex h-11 w-11 md:h-10 md:w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Lock className="h-4 w-4" aria-hidden />
      </button>
    </TooltipTrigger>
  )
}

export const Cerrado: Story = {
  render: () => (
    <Tooltip>
      <IconButton />
      <TooltipContent>Solo el admin puede editar Configuración</TooltipContent>
    </Tooltip>
  ),
}

/** `defaultOpen` (Radix, sin estado controlado) para mostrar el contenido directamente. */
export const Abierto: Story = {
  render: () => (
    <Tooltip defaultOpen>
      <IconButton />
      <TooltipContent>Solo el admin puede editar Configuración</TooltipContent>
    </Tooltip>
  ),
}

/** Foco (teclado/AT): aparece sin el delay de 300ms que sí aplica al hover. */
export const AbrePorFoco: Story = {
  render: () => (
    <Tooltip>
      <IconButton />
      <TooltipContent>Solo el admin puede editar Configuración</TooltipContent>
    </Tooltip>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trigger = canvas.getByRole('button')
    await userEvent.tab()
    await expect(trigger).toHaveFocus()

    // El texto aparece DOS veces (la burbuja visible + el <span role="tooltip">
    // accesible para lectores de pantalla): getByText matchea ambos y tira
    // "Found multiple elements". El rol es único.
    const body = within(canvasElement.ownerDocument.body)
    await expect(await body.findByRole('tooltip')).toHaveTextContent(
      'Solo el admin puede editar Configuración',
    )
  },
}
