# Storybook — TurnoGol

Storybook es el banco de pruebas de la UI: cada componente aislado, con sus estados reales, datos
deterministas, tests de interacción y un chequeo de accesibilidad que **rompe el build** si falla.

- **Arquitectura y decisiones** (por qué cada pieza es como es): [`STORYBOOK_ARCHITECTURE.md`](./STORYBOOK_ARCHITECTURE.md)
- **Inventario y cobertura** (los 266 archivos, con motivo de cada exclusión): [`STORYBOOK_COVERAGE.md`](./STORYBOOK_COVERAGE.md) · [`storybook-coverage.json`](./storybook-coverage.json)
- **QA visual** (bugs encontrados y corregidos): [`STORYBOOK_QA_REPORT.md`](./STORYBOOK_QA_REPORT.md)

---

## Comandos

```bash
pnpm storybook          # dev server en :6006
pnpm build-storybook    # build estático → storybook-static/ (gitignored)

pnpm test:storybook     # TODAS las stories como tests en chromium headless:
                        #   render + play function + axe (a11y)
                        # Una violación de accesibilidad FALLA el comando.

pnpm qa:storybook       # sweep visual con agent-browser: matriz story × viewport,
                        # screenshots, consola, excepciones, requests escapados,
                        # chequeos estructurales (overflow, targets táctiles, imágenes rotas)
```

`qa:storybook` necesita Storybook corriendo. Flags útiles:

```bash
pnpm qa:storybook -- --grep "Booking/"                    # filtrar por título
pnpm qa:storybook -- --viewports mobile-primary,desktop   # subconjunto de viewports
pnpm qa:storybook -- --theme dark                         # el sweep en modo oscuro
pnpm qa:storybook -- --session sb-mobile                  # sesión aislada (para correr varios en paralelo)
```

Viewports: `mobile-small` (360×800) · `mobile-primary` (393×851) · `tablet` (768×1024) ·
`laptop` (1366×768) · `desktop` (1440×900) · `desktop-large` (1920×1080).

---

## Escribir una story nueva

Colocada junto al componente, como `<Componente>.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { bookingRow } from '@/test/fixtures/booking'
import { BookingCard } from './BookingCard'

const meta = {
  title: 'Booking/BookingCard',        // título explícito, siempre
  component: BookingCard,
  parameters: { layout: 'padded' },
  args: { onSelect: fn() },
} satisfies Meta<typeof BookingCard>

export default meta
type Story = StoryObj<typeof meta>

export const Confirmada: Story = {
  args: { booking: bookingRow({ status: 'confirmed', depositStatus: 'paid' }) },
}

export const Ausente: Story = {
  args: { booking: bookingRow({ status: 'no_show', depositStatus: 'captured' }) },
}
```

### Las reglas que el linter y el runner te van a exigir

1. **Datos: siempre de `@/test/fixtures/*`.** Nunca literales gigantes dentro de la story, nunca
   `faker`. Si te falta un caso, agregá una función a la fixture que corresponda.
2. **Reproducí el contenedor real.** Andá al `page.tsx` que usa tu componente y mirá en qué lo
   envuelve (`.card-premium`, `PortalShell`, `ReservaDarkShell`, un ancho máximo). Reproducilo en un
   `decorators` del meta. **Una story sin su contenedor miente** sobre el layout *y* sobre el
   contraste: axe mide contra el fondo que le ponés, así que un fondo falso da un veredicto falso en
   las dos direcciones.
3. **Las Server Actions entran por prop, nunca por import.** Un `import { x } from './actions'` de
   valor mete `drizzle`/`postgres`/`node:async_hooks` en el bundle de browser y la story explota.
   `import type` sí está permitido. Hay un `no-restricted-imports` que lo hace fallar en lint.
   Template: `src/app/(admin)/settings/reservas/ReservasPolicyForm.tsx`.
4. **`await` en todo.** `@typescript-eslint/no-floating-promises` es error: cada `userEvent.*` y cada
   `expect(...)` dentro de un `play` va con `await`.
5. **Assertions sobre lo observable** (rol, texto, `disabled`), no sobre el markup interno. Radix
   emite ids tipo `:r0:` — cualquier snapshot de DOM es basura frágil.
6. **`import { ... } from 'storybook/test'`**, que trae `fn`, `expect`, `userEvent`, `within`,
   `waitFor`, `spyOn`, `mocked`. No instales `@testing-library/user-event`: ya viene vendorizado.

### Red y hooks

```tsx
// fetch: tabla de rutas. Un array en `json` es una SECUENCIA (una respuesta por llamada),
// que es como se scriptea un polling.
parameters: {
  fetchMock: [
    { match: '/api/bookings/', json: [
      { data: { status: 'pending_payment' } },
      { data: { status: 'confirmed' } },
    ]},
  ],
}

// hooks que abren WebSockets u otra cosa no-mockeable → vi.mock() de vitest.
//
// OJO: `sb.mock()` de storybook/test es un NO-OP en esta instalación (su cuerpo está
// literalmente vacío: `node -e "console.log(String(require('storybook/test').sb.mock))"`).
// No falla, no avisa: simplemente no hace nada, y la story carga el módulo REAL.
import { vi } from 'vitest'
import { useBookingRealtime } from '@/hooks/use-booking-realtime'

vi.mock(import('@/hooks/use-booking-realtime'))

// ...y en la story:
beforeEach: () => {
  vi.mocked(useBookingRealtime).mockReturnValue({
    bookings: gridBookings(),
    status: 'SUBSCRIBED',
    refetch: fn(),
  })
}
```

### next/navigation

Ya viene mockeado por el framework. No escribas mocks.

```tsx
parameters: { nextjs: { appDirectory: true, navigation: { pathname: '/grilla', query: { date: '2026-03-14' } } } }

// para assertions:
import { getRouter } from '@storybook/nextjs-vite/navigation.mock'
await expect(getRouter().push).toHaveBeenCalledWith('/grilla?date=2026-03-15')
```

---

## Accesibilidad

`@storybook/addon-a11y` corre con `test: 'error'`: **una violación de axe rompe `pnpm test:storybook`.**

Cuando falle, primero preguntate de quién es el bug:

- **¿La story no reproduce el contenedor real?** → arreglá la story (regla 2). Es el caso más común.
- **¿El componente está mal?** → arreglá el componente.

**Nunca** desactives la regla para que pase. Si de verdad hay una excepción legítima, va acotada a esa
story y con un comentario que explique por qué.

> **Contraste — el error recurrente del repo.** `text-emerald-400` sobre `bg-emerald-500/10` da
> **1.75:1** en una superficie clara: ilegible. El idiom correcto es
> `text-emerald-700 dark:text-emerald-400` (4.99 light / 8.31 dark, ambos pasan AA).
> **Pero** en superficies **siempre oscuras** (`(business)/para-complejos` tiene `#020617`
> hardcodeado, `ReservaDarkShell`, `.player-hero-band`) `emerald-400` es **correcto**.
> Medí antes de cambiar; nada de sweeps ciegos.

---

## Determinismo (por qué las fechas no se mueven)

El reloj está congelado en **`FROZEN_NOW = 2026-03-14T18:30:00Z`** (sábado 15:30 ART). Se congelan
solo `Date.now()` y `new Date()` sin argumentos; los timers quedan reales.

Todo timestamp de fixture se expresa **relativo** a `FROZEN_NOW`, con los helpers de
`@/test/fixtures/clock` (`minutesFromNow`, `hoursFromNow`, `daysFromNow`). Si un `expiresAt` queda mal
respecto de `FROZEN_NOW`, componentes como `PaymentStatusWatcher` se quedan para siempre en un
spinner.

---

## Regresión visual

`pnpm qa:storybook` deja los screenshots y el manifiesto en `artifacts/storybook-qa/` (**gitignored**).
Para actualizar un baseline: revisá el screenshot nuevo a ojo, confirmá que el cambio es intencional,
y recién ahí reemplazá el baseline.

**Chromatic**: no está configurado y no hay credenciales. Se puede integrar (`chromatic --project-token`)
sin tocar una sola story. La validación local con `agent-browser` no depende de él.
