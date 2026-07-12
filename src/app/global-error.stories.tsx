import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, within } from 'storybook/test'
import GlobalError from './global-error'

/**
 * Boundary catastrófico: reemplaza TODO el layout raíz (Next exige que renderice
 * su propio <html>/<body>). Storybook monta la story dentro del <body> real del
 * iframe de preview, así que este componente termina anidando <html>/<body>
 * dentro del documento existente — HTML inválido por definición. React lo arma
 * igual (createElement/appendChild, no parsing de string) y el contenido SÍ
 * queda visible y consultable por texto/rol, pero el navegador desecha el
 * <html>/<body> anidados y aplana los hijos directo bajo el <body> real; en esa
 * reescritura React pierde el listener sintético del botón (queda con un
 * `onclick` noop). Verificado a mano: `userEvent.click`/`btn.click()` en un
 * `play` NO disparan `reset` acá — no es un bug del componente (Next exige este
 * shape), es un límite del entorno de Storybook para este caso puntual. Por eso
 * esta story no interactúa; solo confirma que el contenido esperado está
 * presente y accesible.
 */
const meta = {
  title: 'Layout/GlobalErrorBoundary',
  component: GlobalError,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof GlobalError>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    error: Object.assign(new Error('Error catastrófico en el layout raíz'), { digest: undefined }),
    reset: fn(),
  },
  play: async () => {
    const doc = within(document.body)
    await expect(doc.getByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument()
    await expect(doc.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  },
}
