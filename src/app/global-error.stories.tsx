import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { expect, fn, within } from 'storybook/test'
import GlobalError from './global-error'

/**
 * Boundary catastrófico: reemplaza TODO el layout raíz (Next exige que renderice
 * su propio <html>/<body>). Montado como story normal —anidado varios niveles
 * abajo de los decorators globales (withFetch/withMotion/withTheme)—, React 19
 * trata `<html>`/`<body>` como "host singletons": los resuelve SIEMPRE a
 * `document.documentElement`/`document.body` reales (`resolveSingletonInstance`
 * en react-dom-client), en vez de crear nodos nuevos anidados. Verificado a
 * mano en este entorno: con ese montaje decorado, el contenido de GlobalError
 * (`<main>`, `<h1>`, el botón) no termina en NINGÚN lugar del documento
 * (`document.querySelector('h1')` → `undefined`), sin que se tire ninguna
 * excepción ni warning extra más allá del `validateDOMNesting` esperado por
 * la anidación inválida — es decir, el commit del subárbol se pierde en
 * silencio. No es un bug del componente (Next exige este shape); es un
 * límite real de este entorno de test para este caso puntual. La solución
 * verificada: montar una raíz de React propia en un `<div>` colgado directo
 * de `document.body` (sin decorators globales de por medio) SÍ deja el
 * contenido anclado ahí de forma consultable. Por eso `render` no monta
 * ⚠️ CONSECUENCIA, explícita para que no se lea como cobertura que no existe:
 * el `play` desmonta su raíz en el `finally`, así que cuando corre el scan de
 * axe (afterEach) `GlobalError` YA NO está en el documento. **Esta story no
 * aporta cobertura de accesibilidad sobre ese componente** — solo verifica que
 * renderiza el heading y el botón esperados. Dejar el contenedor montado para
 * que axe lo alcance no es opción: las dos raíces compiten por el singleton de
 * `<html>`/`<body>` y contaminan la story siguiente.
 *
 * GlobalError automáticamente (ese montaje decorado seguiría perdiéndose y,
 * además, si coexiste con la raíz manual del `play`, React tira el warning de
 * "mounting a new <html>/<body> when a previous one has not first unmounted"
 * porque las dos raíces compiten por el mismo singleton): toda la verificación
 * pasa por `play`, que monta su propia raíz y la desmonta al final para no
 * contaminar la story siguiente.
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
  // El render automático de la story se pierde igual (ver comment arriba) y
  // choca con el montaje manual del play; toda la verificación vive ahí.
  render: () => <></>,
  play: async ({ args }) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    try {
      flushSync(() => root.render(<GlobalError {...args} />))
      const doc = within(container)
      await expect(doc.getByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument()
      await expect(doc.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
    } finally {
      flushSync(() => root.unmount())
      container.remove()
    }
  },
}
