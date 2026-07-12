# Storybook — Reporte de QA

Estado al cierre de la sesión. **Los números de este documento son medidos, no estimados**: cada
uno sale de una corrida real cuyo comando está indicado. Lo que quedó sin verificar, está marcado
como tal.

---

## Resumen

Storybook 10 quedó integrado, con las 214 stories corriendo como tests (render + `play` + axe) en
chromium headless. El trabajo destapó **cinco bugs de accesibilidad reales en producción** que no
tenían nada que ver con Storybook — Storybook simplemente fue el primer lugar donde se los pudo ver.

El más interesante no es una clase de Tailwind mal puesta: es una **zona muerta en el heat map de la
grilla de precios** donde, para el 41% del rango de precios, *ningún* color de texto llegaba al mínimo
de contraste. Ver el hallazgo #2.

---

## Bugs de producción encontrados y corregidos

Todos los ratios de contraste están medidos con la fórmula de luminancia relativa de WCAG 2.x.
Umbral AA para texto normal: **4.5:1**.

### 1. El token `--muted-foreground` no llegaba a AA — 175 violaciones

`text-muted-foreground` sobre `bg-muted` daba **4.24:1**. Por debajo del 4.5 que
`docs/spec/design-system/MASTER.md` §2.4 declara como objetivo del sistema. Afectaba a **todo badge o
chip "muted" de la app** (los chips de estado, el "Turno fijo" de la grilla).

| | ratio |
|---|---|
| `--muted-foreground: 215 20% 40%` (antes) sobre `bg-muted` | 4.24 ✗ |
| `--muted-foreground: 215 20% 36%` (ahora) sobre `bg-muted` | **4.93** ✓ |
| …sobre `--card` | 7.16 ✓ |
| …sobre `--background` | 5.78 ✓ |

Cuatro puntos de luminosidad. Imperceptible a la vista, decisivo para un lector con baja visión.

**Archivo**: `src/app/globals.css`

---

### 2. Zona muerta en el heat map de la grilla de precios — 182 violaciones

**Este es el hallazgo que justifica el ejercicio entero.**

Las celdas de `PricingGrid` pintan su fondo con un color interpolado (inline style, un heat map de
barato → caro) y eligen el color del texto con un umbral:

```ts
color: t > 0.52 ? '#ffffff' : '#064e3b'
```

El problema no era el umbral. Era que **no existe ningún umbral que funcione**:

| | mantiene AA |
|---|---|
| `#064e3b` (emerald-900, el texto "barato") | solo hasta **t ≤ 0.48** |
| `#ffffff` (el texto "caro") | recién desde **t ≥ 0.89** |

Entre `t = 0.48` y `t = 0.89` — **el 41% del rango de precios** — ningún color de texto llegaba a
4.5:1. Y el umbral `0.52` caía justo adentro del agujero. La rampa oscura tenía el mismo hueco entre
0.47 y 0.83.

axe lo reportó como blanco sobre `rgb(81,164,140)` = **2.98:1**, 182 veces.

**El fix no fue mover el umbral, fue eliminarlo.** El texto se elige ahora por **contraste medido**
entre `#ffffff` y `#020617` (slate-950, que ya es el `--background` del tema oscuro — no un color
inventado). Ese par es el único de los evaluados que cubre las dos rampas enteras sin agujeros:

| par de textos | `t` sin AA (rampa clara) | `t` sin AA (rampa oscura) |
|---|---|---|
| blanco / emerald-900 *(antes)* | 41% del rango | 36% del rango |
| blanco / emerald-950 | 16% | 15% |
| **blanco / slate-950** *(ahora)* | **0** | **0** |

Elegir por medición y no por umbral hace además que el componente se **auto-corrija** si alguien mueve
los extremos de la rampa.

**Archivo**: `src/app/(admin)/canchas/components/pricing-grid/cell-utils.ts`
**Guard**: `tests/unit/pricing-grid-contrast.test.ts` barre `t` de 0 a 1 en ambos temas. No verifica
"el color que elegimos hoy": verifica el **contrato** — que para cualquier precio, la celda sea
legible. Si alguien reabre el agujero, se pone rojo.

---

### 3. Los Popover eran diálogos sin nombre accesible

Radix rinde `PopoverContent` con `role="dialog"`. Sin nombre accesible, un lector de pantalla anuncia
*"diálogo"* y nada más. Afectaba a `Combobox`, `DatePicker`, `PhoneInput` y el popover de detalle de
la grilla de reservas.

**Archivos**: `combobox.tsx`, `date-picker.tsx`, `phone-input.tsx`, `BookingCard.tsx`

---

### 4. Semántica rota del listbox en Combobox y PhoneInput

- **`aria-required-children`**: el `<ul role="listbox">` metía un `<li role="presentation">` para el
  mensaje "sin resultados". Un listbox solo admite hijos `option` o `group`. El mensaje salió del
  `<ul>` (un listbox vacío sí es válido).
- **`scrollable-region-focusable`**: la lista de países del `PhoneInput` scrollea
  (`max-h-56 overflow-y-auto`) pero **no era alcanzable por teclado** — sin mouse, los países de abajo
  eran inaccesibles. Va `tabIndex={0}` + focus ring.
- **`aria-input-field-name`**: ese mismo listbox no tenía nombre accesible.

**Archivos**: `combobox.tsx`, `phone-input.tsx`

---

### 5. `emerald-600` y `emerald-400` sobre superficies claras

El idiom correcto del repo es **`text-emerald-700 dark:text-emerald-400`**. Medido sobre una card
blanca:

| clase | ratio | |
|---|---|---|
| `text-emerald-400` | **1.75** | ✗ prácticamente invisible |
| `text-emerald-600` (#059669) | **3.76** | ✗ |
| `text-emerald-700` (#047857) | **5.50** | ✓ |

Corregido en `ReservasPolicyForm` (los chips de selección) y `StatCard` (el delta positivo). Queda un
long tail en otros componentes — ver *Pendientes*.

> **La excepción importa**: en superficies **siempre oscuras** — `(business)/para-complejos`
> (`background: #020617` hardcodeado), `ReservaDarkShell`, las recipes `.player-hero-band` /
> `.landing-hero` / `.cta-band` — `emerald-400` es **correcto**. No hacer sweeps ciegos: medir.

---

## Bugs de infraestructura encontrados (no de UI)

### Flake de integración de 1 en 7

`tests/helpers/factories.ts` — `insertAbonado` sacaba el `day_of_week` de
`faker.number.int({ min: 0, max: 6 })` sobre **la misma cancha** que devuelve `seedIsolationData`, con
horario fijo 20:00–21:00. `race-abonado-vs-individual.test.ts` crea un abonado el **lunes 20:00–21:00
en esa cancha**: cuando el faker sacaba lunes, `createAbonado` tiraba `AbonadoConflictError` y el test
moría por una razón sin ninguna relación con lo que estaba probando.

**Medido**: 1 de 8 corridas en rojo antes; 10 de 10 en verde después. La suite de integración pasó de
84/85 a **85/85**.

### Vitest 3 rompió tipos sin romper runtime

`vi.fn` unificó sus genéricos: era `vi.fn<TArgs, TReturn>()`, ahora es `vi.fn<T extends Procedure>()`.
**`pnpm test` pasaba en verde y `pnpm typecheck` estaba rojo.** Quien corra solo los tests no se entera.

### Fuga de la capa de DB al bundle de browser

`TENANT_STATUSES` / `isTenantStatus` (una lista de 8 strings y un type guard) vivían en
`super-admin/tenants.service.ts`, que importa `drizzle-orm` y `@/shared/db/client`. Cualquier
componente presentacional que solo necesitara la lista de estados **se arrastraba todo el bundle de
Postgres al browser** y reventaba con `Buffer is not defined` desde `postgres/src/bytes.js`.
Movidos a `billing.types.ts` (módulo puro, cero imports de valor), con re-export desde el service para
no romper consumidores.

---

## Decisiones de arquitectura que se pagaron solas

### `sb.mock()` no sirve sobre una Server Action

Antes de refactorizar 12 archivos de producción, se probó el camino barato: mockear el módulo
`'use server'` con `sb.mock()`. **No funciona.** El automock igual tiene que *cargar* el módulo real
para enumerar sus exports, así que arrastra `request-context` → `node:async_hooks`, Vite lo externaliza
en el bundle de browser, y la story muere con:

```
Module "node:async_hooks" has been externalized for browser compatibility.
```

El experimento costó una story y confirmó que la **inyección por prop** era obligatoria, no una
preferencia. Detalle completo en [`STORYBOOK_ARCHITECTURE.md`](./STORYBOOK_ARCHITECTURE.md).

### Una story sin su contenedor real miente

Caso concreto: se storyeó `ReservasPolicyForm` suelto sobre `bg-background` y axe falló por contraste.
Pero en la app el form vive dentro de `.card-premium` (superficie blanca), donde el mismo texto **sí**
pasa. La story estaba inventando un contexto que no existe.

axe mide el contraste **contra el fondo que le pongas**. Un fondo falso da un veredicto falso en las
dos direcciones: reporta bugs que no existen, y tapa los que sí. Por eso la regla #2 de
[`README.md`](./README.md) es reproducir el contenedor real en un `decorators`.

---

## Números

Todos medidos. Comando entre paréntesis.

| Gate | Resultado |
|---|---|
| `pnpm typecheck` | ✅ 0 errores |
| `pnpm lint` | ✅ 0 errores |
| `pnpm test` (unit) | ✅ **208 archivos / 1534 tests** |
| `pnpm test:integration` | ✅ **85 archivos / 566 tests** *(era 84/85 — el flake cayó)* |
| `pnpm test:isolation` | ✅ 111 tests |
| `pnpm build-storybook` | ✅ build estático OK |
| `pnpm test:storybook` | ⚠️ **675 / 786 stories** (111 rojas, ver Pendientes) |
| `pnpm test:e2e` | ✅ **24 pasan / 54 fallan — IDÉNTICO al commit base**. Cero regresiones. Los 54 son pre-existentes (`starts_at`) |
| `pnpm build` | 🚫 falla al prerenderizar `/sitemap.xml`, por el mismo rol NOLOGIN. `✓ Compiled successfully`: el código compila |

### Progresión de las stories rojas

Cada fix fue medido, no declarado:

| | tests rojos | violaciones de contraste |
|---|---|---|
| Recién escritas las 214 stories | 194 | 566 |
| Tras el token `--muted-foreground` | 171 | 393 |
| Tras el heat map + los primitives | 159 | 213 |
| Tras la remediación parcial | **111** | **149** |

---

## Validación de la app real — cero regresiones

Las extracciones presentacionales tocaron **26 páginas**. Era el riesgo más grande de todo el trabajo.

### El entorno local estaba roto, y el mensaje de error engañaba

`pnpm build` y `pnpm test:e2e` fallaban con:

```
password authentication failed for user "turnogol_app"
```

**No era la contraseña.** El rol `turnogol_app` existe pero tiene **`rolcanlogin = false`**:

```sql
select rolname, rolcanlogin from pg_roles where rolname = 'turnogol_app';
--  turnogol_app | f
```

Postgres reporta un rol NOLOGIN con el mismo mensaje que una contraseña incorrecta.

Es **por diseño**: `supabase/migrations/…_turnogol_app_grants.sql` dice explícitamente que
`ALTER ROLE turnogol_app WITH LOGIN PASSWORD '...'` se hace **a mano, fuera de las migraciones** (para
no versionar una contraseña). Los tests de integración funcionan porque `ensureRoles()` los conecta como
`postgres` y hace `SET LOCAL ROLE` — nunca hacen login como el rol. La **app** sí, y ese paso de setup
nunca se había hecho en esta máquina.

Aplicado contra el Supabase local (**reversible**: `ALTER ROLE turnogol_app NOLOGIN`), `/api/status` pasó
de **503** (`database: down`) a **200** (`database: ok`).

### e2e: idéntico al baseline

Con la DB andando, se corrió `playwright test --project chromium` en la rama **y** en un worktree del
commit base (`d80b686` — el WIP del usuario, sin ninguno de estos cambios):

| | pasan | fallan |
|---|---|---|
| **Base** (`d80b686`) | 24 | 54 |
| **Esta rama** | 24 | 54 |

Los dos tests que aparecían como regresión en el diff (`availability:12` y el CTA de `/para-complejos`)
**pasan al correrlos aislados** → eran flake. Y el diff es simétrico: otros dos fallan en el base y no
acá. Los totales son idénticos.

> **Los 54 fallos son pre-existentes** y tienen una causa clara:
> `insertBooking failed: null value in column "starts_at" violates not-null constraint`.
> Los helpers de `tests/e2e/abonados-crud.spec.ts` hacen un **INSERT crudo** sin `starts_at`, la columna
> que agregó el refactor de instantes físicos. El INSERT revienta, deja la DB sucia, y contamina la
> corrida entera — por eso los totales bailan entre corridas. Es el mismo patrón ya registrado en la
> memoria del proyecto: *"grepear INSERT crudo, no solo `.insert(bookings)`"*. Quedaron helpers de e2e
> sin migrar. **Fuera del scope de este trabajo, pero vale un fix.**

### Las páginas refactorizadas, probadas a mano

Con `agent-browser` contra la app real:

| Página | h1 | errores de consola | overflow horizontal |
|---|---|---|---|
| `/` (landing, extraída a `src/app/home/*`) | ✅ | 0 | no |
| `/login` | ✅ | 0 | no |
| `/register` | ✅ | 0 | no |
| `/ingresar` | ✅ | 0 | no |
| `/forgot-password` | ✅ | 0 | no |
| `/explorar` | ✅ | 0 | no |
| `/precios` | ✅ | 0 | no |
| `/para-complejos` | ✅ | 0 | no |

**Y lo más importante — la inyección de Server Actions funciona end-to-end**: se cargó `/login`, se
completó el form con credenciales inválidas y se envió. La app respondió **"Email o contraseña
incorrectos."**. Es decir: el `page.tsx` inyecta la action al componente extraído, `useFormState` la
recibe, se ejecuta contra la DB y renderiza el error. El refactor no es solo "compila": **anda**.

---

## Pendientes

Honestamente, lo que **no** está hecho:

1. **111 stories siguen rojas.** El grueso sistémico está corregido; queda el long tail:
   - ~149 violaciones de contraste caso por caso (badges de estado, chips, textos secundarios)
   - 33 `TestingLibraryElementError` — `play` functions que buscan elementos con el nombre equivocado
   - 14 "Found multiple elements" — queries ambiguas
   - 7 `mocked(...) is not a function` — uso incorrecto de `mocked()` sobre deps que van por prop
   - 6 `aria-hidden-focus` — **requiere investigación**: aparece cuando Radix abre un modal y
     aria-oculta a sus hermanos. Hay que determinar si pasa también en la app real (bug de componente)
     o si es un artefacto del wrapper de la story.

   El método está establecido y documentado: medir el contraste antes de cambiar un color, y decidir
   si el bug es del componente o de la story mirando el contenedor real.

2. **QA visual con `agent-browser`** en los 6 viewports. El driver está escrito y probado
   (`scripts/storybook-qa.mjs`, `pnpm qa:storybook`) pero **no se corrió el sweep completo**.

3. **Regresión visual con baselines.** No se establecieron baselines: no tiene sentido hacerlo con 111
   stories todavía rojas.

4. **Review independiente.** No se ejecutó (se agotó el límite de sesión).

---

## Hallazgo aparte: la suite de e2e está caída entera (pre-existente, fuera de scope)

No lo causó este trabajo y no se arregló acá, pero es lo bastante grave como para dejarlo escrito.

El refactor de **instantes físicos** hizo `bookings.starts_at` / `ends_at` NOT NULL. La migración
**nunca llegó a la capa de e2e**: los helpers siguen haciendo INSERT crudo sin esas columnas. El INSERT
revienta con

```
null value in column "starts_at" of relation "bookings" violates not-null constraint
```

…el test muere sembrando sus datos (ni siquiera llega a probar nada), deja la DB sucia, y contamina las
corridas siguientes — por eso los totales bailan entre corridas y hay tests que fallan o pasan según el
orden.

**Son 13 archivos**, la clase completa:

```
tests/e2e/_helpers/booking-seed.ts
tests/e2e/_helpers/player-seed.ts
tests/e2e/abonados-crud.spec.ts
tests/e2e/booking-flow.spec.ts
tests/e2e/canchas-crud.spec.ts
tests/e2e/capture-screenshots.spec.ts
tests/e2e/critical-flows/admin-cancel-mp-refund.spec.ts
tests/e2e/critical-flows/admin-create-booking-ui.spec.ts
tests/e2e/grilla-realtime.spec.ts
tests/e2e/mobile/admin-mobile-smoke.spec.ts
tests/e2e/player-bookings.spec.ts
tests/e2e/reportes.spec.ts
tests/e2e/reservas-crud.spec.ts
```

Encontrados con:
```bash
for f in $(grep -rln "from('bookings')\|INSERT INTO bookings" tests/); do
  grep -q "starts_at\|startsAt" "$f" || echo "SIN starts_at: $f"
done
```

Es exactamente la lección que ya está en la memoria del proyecto — *"grepear INSERT crudo, no solo
`.insert(bookings)`"* — pero aplicada solo a los workers, no a los e2e.

**Arreglar esto probablemente lleve la suite de 54 rojos a verde.** Es el fix de mayor ROI pendiente en
el repo, y no tiene nada que ver con Storybook.

> **Gotcha de la máquina**: `agent-browser` invocado desde Node en Windows **cuelga** si se le da un
> pipe — levanta un daemon que hereda el fd de stdout y nunca lo cierra, así que `execFileSync` espera
> un EOF que no llega. `scripts/storybook-qa.mjs` lo resuelve pasándole un **file descriptor de
> archivo** en vez de un pipe. Está documentado en el propio script.
