# Storybook — Arquitectura

Por qué cada pieza es como es. Si vas a cambiar algo de `.storybook/`, leé esto primero:
varias de estas decisiones parecen arbitrarias y no lo son.

---

## Stack elegido

| Pieza | Elección | Versión |
|---|---|---|
| Storybook | `storybook` | 10.5.x |
| Framework | **`@storybook/nextjs-vite`** | 10.5.x |
| Runner | `@storybook/addon-vitest` (browser mode, Playwright/chromium) | 10.5.x |
| a11y | `@storybook/addon-a11y` con `test: 'error'` | 10.5.x |
| Docs | `@storybook/addon-docs` | 10.5.x |
| Bundler | Vite 6 (peer del framework) | ^6.4.3 |
| Vitest | **3.2.7** (subido desde 1.6.1) | 3.2.7 |

---

## `@storybook/nextjs-vite` no es una preferencia: es load-bearing

```
node_modules/react-dom@18.3.1   →  useFormState: undefined   useFormStatus: undefined
next/dist/compiled/react-dom    →  useFormState: function    useFormStatus: function
```

React 18.3.1 **no exporta** `useFormState` ni `useFormStatus`. Los únicos que existen viven en
la copia vendorizada de React que Next trae adentro (una canary). El webpack de Next aliasea
`react-dom` a esa copia, y por eso los ~15 componentes del repo que usan esos hooks funcionan
en la app.

`@storybook/nextjs-vite` incluye `vite-plugin-storybook-nextjs`, que **replica ese alias**
(`react-dom$ → next/dist/compiled/react-dom`). Bajo cualquier otro setup React/Vite genérico,
los 15 componentes tiran `useFormState is not a function` y el resto de la app renderiza
perfecto — el clásico "la mitad funciona", que es el peor síntoma posible para debuggear.

De regalo, el mismo plugin trae: `next/font`, `next/image`, `next/link`, los mocks de
`next/navigation` y `next/router`, un stub de `server-only`, `next/dynamic`, y los paths de
`tsconfig` (`@/*`) vía `vite-tsconfig-paths`. Y usa **el SWC de Next** como transform de TS/JSX,
por lo que **no hace falta `@vitejs/plugin-react`**.

**Fallback documentado**: si el plugin se rompe contra un internal privado de Next, se cambia
`framework.name` a `@storybook/nextjs` (builder webpack5, mismo peer de Next, mismo alias). Todo
lo demás de este diseño es agnóstico del builder salvo dos líneas: el `framework.name` y el
specifier de `navigation.mock`.

---

## Vitest 3: por qué el upgrade era obligatorio

`@storybook/addon-vitest@10.5` declara `peerDependencies: { vitest: "^3 || ^4" }`. Con pnpm en
modo estricto hay **un solo `vitest` top-level**: no existe forma de contener la versión por
archivo de config. O se migraba la suite, o no había addon.

Dos roturas reales, **ninguna de las cuales crashea** (por eso son peligrosas):

1. **El pool default pasó de `threads` a `forks` en Vitest 2.** `vitest.config.ts` seteaba
   `poolOptions.threads.singleThread: true` **sin key `pool`**. En Vitest 3 eso queda ignorado en
   silencio y los 85 tests de integración (Postgres compartido, RLS, `isolation.test.ts`) pasan a
   correr en forks paralelos y racean. Se manifiesta como flake, no como error.
   → Fix: `pool: 'threads'` explícito. Reproduce el runtime exacto de antes.

2. **`vi.fn` unificó sus genéricos.** Era `vi.fn<TArgs, TReturn>()`, ahora es
   `vi.fn<T extends Procedure>()` (la firma entera). **El runtime pasa igual**; lo que rompe es el
   `typecheck`. Si corrés `pnpm test` y no `pnpm typecheck`, no te enterás.

`vitest.storybook.config.ts` es una config **separada a propósito**: `vitest.config.ts` nunca crece
una key `browser`, y `vitest run --dir tests/unit` nunca ve un `.stories.tsx`. Los 207 unit y los 85
integration conservan su semántica exacta.

---

## Server Actions: por qué se inyectan por prop y no se mockean

> ### ⚠️ `sb.mock()` NO HACE NADA en esta instalación
>
> No es "no sirve para 'use server'": **es un no-op, literalmente**. Verificable en 3 segundos:
>
> ```bash
> node -e "const t=require('storybook/test'); console.log(String(t.sb.mock))"
> # () => {
> #   }
> ```
>
> En `storybook@10.5.0`, `sb.mock` está declarado pero su cuerpo está vacío. Y el `hoistMocksPlugin`
> de `@vitest/mocker@3.2.7` solo reconoce `vi` / `vitest` como objetos de utilidades a hoistear —
> nada en `@storybook/addon-vitest` lo extiende a `sb`. O sea que ni siquiera se hoistea.
>
> **Para mockear un módulo desde una story, usá `vi.mock()` de `vitest`.** Funciona: se hoistea y
> reemplaza el módulo de verdad. No está en la lista de imports prohibidos del `.eslintrc`.
>
> ```ts
> import { vi } from 'vitest'
> import { useBookingRealtime } from '@/hooks/use-booking-realtime'
>
> vi.mock(import('@/hooks/use-booking-realtime'))
> ```

**Lo anterior explica por qué las Server Actions se inyectan por prop.** Se probó mockear el módulo
`'use server'` con `sb.mock()` y la story explotaba igual — porque el mock nunca se aplicaba y el
módulo REAL se cargaba. Un `'use server'` importa la capa de servicios → `drizzle` + `postgres` +
`src/shared/lib/request-context.ts` → **`node:async_hooks`**. Vite lo externaliza en el bundle de
browser y la story muere con:

```
Module "node:async_hooks" has been externalized for browser compatibility.
Cannot access "node:async_hooks.AsyncLocalStorage" in client code.
```

*(Aunque `vi.mock()` sí hoistea, la inyección por prop sigue siendo el patrón preferido para las
Server Actions: no depende del mocker, hace el componente unit-testeable sin `vi.mock`, y es la
separación que el componente debería tener igual. `vi.mock()` queda para lo que no se puede inyectar,
como un hook que abre un WebSocket.)*

El patrón, entonces, es **inyección de dependencia**:

```diff
  // ReservasPolicyForm.tsx  ('use client')
- import { updateReservasPolicyAction, type PolicyActionResult } from './actions'
+ import type { PolicyActionResult } from './actions'   // ← type import: se borra al compilar
+
+ export type UpdateReservasPolicy =
+   (prev: PolicyActionResult, fd: FormData) => Promise<PolicyActionResult>

- export function ReservasPolicyForm({ s }: { s: TenantSettings }) {
-   const [state, formAction] = useFormState(updateReservasPolicyAction, INITIAL_STATE)
+ export function ReservasPolicyForm({ s, action }: { s: TenantSettings; action: UpdateReservasPolicy }) {
+   const [state, formAction] = useFormState(action, INITIAL_STATE)
```
```diff
  // page.tsx  (Server Component — ya tiene la action en scope)
- <ReservasPolicyForm s={settings} />
+ <ReservasPolicyForm s={settings} action={updateReservasPolicyAction} />
```

No es un cambio "para Storybook". Es la separación que el componente debería haber tenido desde el
principio: su unit test **ya hacía** `vi.mock('.../actions')` con el comentario *"Evitar cargar la
Server Action real (drizzle/db) al importar el componente"* — el DI elimina esa necesidad.

`InviteStaffDialog` ya nacía así (recibe `inviteAction` por prop). Es el template de referencia.

**Un `.eslintrc` `no-restricted-imports` sobre `src/**/*.stories.tsx` y `src/test/**` convierte esto
en falla de lint**, no en convención: importar `postgres`, `drizzle-orm`, `@/shared/db/*`,
`@/modules/*/*.service` o cualquier `**/actions` como valor desde una story es un error.

---

## Tema: hacen falta las DOS cosas

`preview.tsx` aplica el tema por dos mecanismos simultáneos, y ninguno es redundante:

1. **La clase `.dark`** (en `<html>` y en un wrapper). `globals.css` scopea ~300 líneas de recipes
   bajo `.dark` (`.card-premium`, `.page-header-band`, `.player-hero-band`, `.reserva-*`,
   `.skeleton`). Son selectores **descendientes**, así que el wrapper alcanza — y es lo que permite
   que Docs mode muestre una story clara y una oscura en el mismo iframe.

2. **El contexto de next-themes.** `src/components/admin/useChartTheme.ts` llama `useTheme()` y
   devuelve colores **HEX** que recharts recibe como props inline. Una clase CSS no le llega. Sin el
   provider, los gráficos quedan en tema claro aunque todo lo demás esté oscuro.

---

## Fuentes: se sirven los woff2 del repo, no `next/font`

`vite-plugin-storybook-nextjs` implementa `next/font/google` **de verdad** — pero lo hace
**fetcheando `fonts.googleapis.com` en build time**. Eso vuelve el build dependiente de la red: en un
runner sin salida, o con la red intermitente, el fetch falla, cae a `system-ui` en silencio, y toda
la regresión visual se pone roja sin que nadie haya tocado un componente.

El repo ya tiene los mismos woff2 commiteados en `.design-sync/fonts/` (Inter, Archivo, Sora), así
que `main.ts` los sirve en `/sb-fonts` vía `staticDirs` y `preview-head.html` los carga con las tres
CSS vars (`--font-inter` / `--font-archivo` / `--font-sora`) que consume el `fontFamily` de Tailwind.
Cero red, salida idéntica.

> **Hueco de fidelidad conocido**: `layout.tsx` pide Sora en 600/700/**800**, y `.design-sync/fonts/`
> solo trae Sora 400/600/700. El peso 800 renderiza como bold sintético de 700. Solo `<Logo>` usa
> `font-logo`. Para cerrarlo: agregar 800 a `.design-sync/fetch-fonts.mjs` y re-correrlo.

---

## Red: por qué no hay MSW

1. Las stories tocan **3 endpoints JSON same-origin**. Una tabla de rutas de 40 líneas sobre
   `window.fetch` (`.storybook/decorators/with-fetch.tsx`) los cubre, soporta **secuencias** (un array
   en `json` se consume de a uno por llamada — así se scriptea un polling `pending → pending →
   confirmed`, que en MSW es más difícil, no más fácil), y cuesta cero dependencias.
2. **MSW no resolvería el caso difícil igual.** `use-booking-realtime.ts` abre un **WebSocket** de
   Supabase Realtime; el service worker de MSW no lo intercepta. Ese camino necesita un module mock
   sí o sí — y el module mock ya cubre el `fetch` de paso.
3. `msw-storybook-addon` obliga a commitear `public/mockServiceWorker.js` dentro del `public/` que se
   sirve **en producción**.

Para mockear un hook (por ejemplo `use-booking-realtime`, que abre el WebSocket), usá **`vi.mock()`
de `vitest`**, no `sb.mock()` — que es un no-op (ver el recuadro más arriba).

---

## Determinismo

- **Reloj congelado**: `FROZEN_NOW = 2026-03-14T18:30:00Z` (sábado 15:30 ART — una tarde de sábado
  llena en la grilla). Se congelan **solo** `Date.now()` y `new Date()` sin argumentos. `new Date(iso)`
  y todos los timers quedan **reales**, lo cual importa: `waitFor()` de testing-library usa
  `setTimeout` real para su deadline, no `Date.now()`, así que los `play` no se cuelgan.
  Todo timestamp de fixture se expresa relativo a `FROZEN_NOW` (`src/test/fixtures/clock.ts`).
- **Fixtures**: literales escritos a mano. **Cero faker** — un bump menor de faker cambia sus
  generadores y mueve todos los snapshots visuales sin que nadie haya tocado un componente. (No es
  teórico: `tests/helpers/factories.ts` tenía un `faker.number.int()` que hacía fallar un test de
  integración 1 de cada 7 corridas.)
- **Reduced motion**: `globals.css` ya trae un bloque `@media (prefers-reduced-motion: reduce)` que
  mata las animaciones CSS. El toggle de la toolbar lo espeja con `.sb-reduce-motion`.
  **No cubre recharts**, que anima en JS → `isAnimationActive={false}`.
- **IDs**: Radix emite ids tipo `:r0:`. Irrelevante para píxeles, pero **nada de snapshots de DOM**
  en los `play`.

### El runner corre con `reducedMotion: 'reduce'`, y no es cosmético

`vitest.storybook.config.ts` le pasa `context: { reducedMotion: 'reduce' }` al browser de Playwright.
**Es lo que hace determinista el scan de axe**, y sin eso la suite es irreproducible.

El scan corre DESPUÉS del `play`, y Radix anima entradas **y salidas**. Un nodo pescado a mitad de
transición tiene `opacity < 1` — y la opacidad diluye **el texto Y el fondo a la vez**. Resultado: axe
mide un contraste que no existe en ningún estado real de la app. Medido: el toast "Caja cerrada" daba
3.66:1 con `fg #3d7e55` / `bg #d7e2db`, y **ninguno de los dos es un color del sistema**: son
`green-800` y `green-50` desvanecidos por el fade.

Se manifestaba como un flake que caía en una story distinta cada corrida, según qué animación llegara
a tiempo. Con reduced-motion las animaciones quedan en `.01ms`: no hay estado transitorio que pescar.

## ⚠️ axe no sabe medir contraste contra un gradiente — y lo calla

Si el fondo de un elemento es un `linear-gradient` (o una imagen), axe **no puede** calcular el
contraste. No lo reporta como `violation`: lo reporta como **`incomplete`**. Y `addon-a11y` con
`test: 'error'` **solo falla con `violations`**.

Traducción: **poner un gradiente detrás de un elemento le apaga el check de contraste a la story, en
silencio.** Una story así pasa siempre, y no porque el contraste esté bien.

No es teórico. La story de `SuccessRedirect` copió fielmente el `linear-gradient` de la card de
`/verify` en su decorator, siguiendo la regla de "reproducí el contenedor real"… y pasó en verde
tapando un **3.91:1**. Recién falló cuando el decorator pasó a usar el color **sólido** ya compuesto
(`#0B1225` = el tope del gradiente sobre el `#020617` de la página).

**Regla**: si la superficie real es un gradiente, en el decorator va el **composite calculado como color
sólido**, y en un comentario, la cuenta. Si el gradiente recorre un rango, se usa el punto de **menor**
contraste — el caso peor es el que hay que testear.

---

## Por qué las stories están colocadas en `src/`

No es tidiness, es enforcement. `src/**/*.stories.tsx` es el único lugar donde ya aplican, sin tocar
una línea de config:

| | colocadas en `src/` | árbol `/stories` aparte |
|---|---|---|
| `content` de Tailwind | ya cubierto por `./src/**/*.{ts,tsx}` | hace falta un 4º glob, y las clases usadas solo ahí se purgan |
| `pnpm lint` (`eslint src/`, **type-aware**) | **linteadas** | **no linteadas** |
| `no-restricted-imports` (server code) | enforced | no enforced |
| `prettier --write src/` | formateadas | no |

El costo aceptado: `tsconfig.include` es `**/*.tsx` y `next build` no ignora errores de TS, así que
**una story que no typechequea rompe `next build`**. Pero también rompe `pnpm typecheck`, que corre
antes — misma señal, más temprano. Si alguna vez molesta, el escape hatch es un
`tsconfig.storybook.json` aparte (no hacerlo preventivamente).

*(Las stories dentro de `src/app/**` no crean rutas: el App Router rutea por nombre de archivo
—`page`/`layout`/`route`/`loading`/`error`— y `X.stories.tsx` no matchea ninguno.)*
