# Storybook — Reporte de QA

Estado al cierre. **Los números son medidos, no estimados**: cada uno sale de una corrida real cuyo
comando está indicado. Lo que quedó sin hacer está en [Pendientes](#pendientes), sin adornos.

---

## Resumen

Storybook 10 quedó integrado y **cada story corre como un test** (render + `play` + axe) en chromium
headless. El trabajo destapó **~25 bugs de accesibilidad reales en producción** que no tenían nada que
ver con Storybook: Storybook fue simplemente el primer lugar donde se los pudo ver.

Dos cosas que vale la pena leer aunque no leas el resto:

- El bug de la **zona muerta del heat map de precios** (#2): no era un color mal elegido, era que
  *ningún* color de texto servía para el 41% del rango de precios.
- Las **dos veces que este mismo documento mintió sobre la cobertura**, y cómo se detectaron
  ([Cobertura](#la-cobertura-mintió-dos-veces)). Es el hallazgo más incómodo del trabajo y el más útil.

---

## Bugs de producción encontrados y corregidos

Ratios medidos con la fórmula de luminancia relativa de WCAG 2.x. AA para texto normal: **4.5:1**.

### 1. El token `--muted-foreground` no llegaba a AA — 175 violaciones

`text-muted-foreground` sobre `bg-muted` daba **4.24:1**. Afectaba a **todo badge o chip "muted" de la
app**. Cuatro puntos de luminosidad de diferencia: imperceptible a la vista, decisivo para alguien con
baja visión.

| | ratio |
|---|---|
| `215 20% 40%` (antes) sobre `bg-muted` | 4.24 ✗ |
| `215 20% 36%` (ahora) sobre `bg-muted` | **4.93** ✓ |

**Archivo**: `src/app/globals.css`

### 2. Zona muerta en el heat map de la grilla de precios — 182 violaciones

**El hallazgo que justifica el ejercicio entero.**

Las celdas de `PricingGrid` interpolan el fondo (barato → caro) y elegían el color del texto con un
umbral: `color: t > 0.52 ? '#ffffff' : '#064e3b'`.

El problema no era el umbral. Era que **no existía ningún umbral que funcionara**:

| | mantiene AA |
|---|---|
| `#064e3b` (emerald-900, texto "barato") | solo hasta **t ≤ 0.48** |
| `#ffffff` (texto "caro") | recién desde **t ≥ 0.89** |

Entre `t = 0.48` y `t = 0.89` — **el 41% del rango de precios** — ningún color llegaba a 4.5:1. Y el
umbral `0.52` caía justo adentro del agujero. axe lo reportó como blanco sobre `rgb(81,164,140)` =
**2.98:1**, 182 veces.

**El fix no fue mover el umbral: fue eliminarlo.** El texto se elige por **contraste medido** entre
`#ffffff` y `#020617`. Ese par es el único evaluado que cubre las dos rampas enteras sin agujeros:

| par de textos | `t` sin AA (rampa clara) | `t` sin AA (rampa oscura) |
|---|---|---|
| blanco / emerald-900 *(antes)* | 41% del rango | 36% |
| blanco / emerald-950 | 16% | 15% |
| **blanco / slate-950** *(ahora)* | **0** | **0** |

Elegir por medición y no por umbral hace que el componente se **auto-corrija** si alguien mueve los
extremos de la rampa.

**Archivo**: `src/app/(admin)/canchas/components/pricing-grid/cell-utils.ts`
**Guard**: `tests/unit/pricing-grid-contrast.test.ts` barre `t` de 0 a 1 en ambos temas. No verifica
"el color que elegimos hoy": verifica el **contrato** — que para cualquier precio la celda sea legible.

### 3. CTAs de marketing a 2.59:1

`bg-primary text-white` sobre fondo oscuro. En dark `--primary` es emerald-500, que necesita texto
**oscuro** (`--primary-foreground` = slate-950 → 7.9:1). Afectaba a `BusinessHeader`,
`/para-complejos`, `/precios` y `PlanSelector`.

### 4. Toasts translúcidos sobre el overlay de un diálogo

Un toast puede aparecer con un `<Dialog>` todavía abierto detrás. El overlay `bg-black/50` oscurece
todo lo que hay debajo, y un fill translúcido (`bg-*/10`) compone contra ESE negro, no contra el fondo
de la app:

| | translúcido | opaco (ahora) |
|---|---|---|
| `success` | 1.40:1 | **6.81:1** (`text-green-800` / `bg-green-50`) |
| `destructive` | 1.30:1 | **5.91:1** (`text-red-700` / `bg-red-50`) |

**Archivo**: `src/components/ui/toast.tsx`

### 5. `DropdownMenu modal={true}` aria-escondía su propio trigger

Radix con `modal=true` llama a `hideOthers()`, que pone `aria-hidden` en todo lo que no sea el menú —
**incluido el trigger, que sigue siendo focusable**. Eso es `aria-hidden-focus`, una violación real.
Afectaba a 5 componentes (`StaffActions`, `QuickActions`, `ShareButton`, `HeroSearch`, `SearchBar`).

Este merece un párrafo aparte porque **la primera versión de las stories lo tapaba**: apretaban
`{Escape}` para cerrar el menú antes de que corriera el scan de axe, así que el gate pasaba en verde
con el bug vivo en producción. Lo encontró el review independiente. Ahora las stories pasan **con el
menú abierto**, que es la única forma de que prueben algo.

### 6. `text-slate-500` sobre las cards siempre-oscuras de `/verify` — 3.91:1

slate-500 (`#64748b`) es un gris del medio: **no llega a AA ni contra fondo claro ni contra oscuro**.
Sobre la card de `/verify` (composite real `#0B1225`) da **3.91:1**. El propio archivo se contradecía:
la línea 104 ya usaba `text-slate-400` (7.33:1, correcto) y la 108 usaba slate-500.

**Archivos**: `src/app/(auth)/verify/page.tsx`, `src/app/(auth)/verify/SuccessRedirect.tsx`

> **Gotcha que este bug destapó, y que vale más que el bug**: la primera versión de la story copió el
> `linear-gradient` real de la card en su decorator, y **pasó en verde**. No porque el contraste
> estuviera bien, sino porque **axe no sabe medir contraste contra un gradiente**: lo reporta como
> `incomplete`, y el addon-a11y solo falla con `violations`. O sea que reproducir fielmente un fondo
> con gradiente **le apaga el check de contraste a la story, en silencio**. La story quedó con el
> composite ya calculado como color **sólido** (`#0B1225`) — y ahí sí falló, con el mismo 3.91 que
> daba el cálculo a mano.

### 7. Otros

- **Popover sin nombre accesible**: Radix rinde `PopoverContent` con `role="dialog"`; un lector de
  pantalla anunciaba *"diálogo"* y nada más (`Combobox`, `DatePicker`, `PhoneInput`, `BookingCard`).
- **`aria-required-children`**: un `<ul role="listbox">` con un `<li role="presentation">` adentro.
- **`scrollable-region-focusable`**: la lista de países del `PhoneInput` scrollea pero **no era
  alcanzable por teclado** — sin mouse, los países de abajo eran inaccesibles.
- **`BookingMiniMap`**: su `aria-label` nunca llegaba al DOM (react-leaflet solo reenvía
  `className`/`id`/`style`).
- **`<ol><Reveal><li>`**: lista inválida (un `<div>` entre el `<ol>` y sus `<li>`).
- **`BookingDetailCard`**: los `<dt>`/`<dd>` de `notesPlayer` y `canceledReason` estaban **fuera** del
  `<dl>` (HTML inválido, axe `dlitem`).
- **`emerald-600` (3.76:1) / `emerald-400` (1.75:1) sobre superficies claras.**

> **La excepción importa**: en superficies **siempre oscuras** — `/para-complejos`, `ReservaDarkShell`,
> las recipes `.player-hero-band` / `.landing-hero` — `emerald-400` y `slate-400` son **correctos**. No
> hacer sweeps ciegos: medir.

### 8. Los que aparecieron al tapar los huecos de cobertura

Estos cuatro salieron **el día que se escribieron las stories que faltaban**. Son la factura de la
cobertura inflada: mientras el inventario decía que estos componentes estaban cubiertos, nadie los
había renderizado nunca bajo axe.

| Componente | Qué medía | Por qué se escapó |
|---|---|---|
| `ExplorarMap.tsx:24` | Pin de precio: blanco bold 12px sobre `#059669` = **3.76:1**. Y era el pin **por defecto**, o sea casi todos. | El color vive en el HTML crudo de un `L.divIcon`, no en una clase de Tailwind. **Un grep no lo ve.** El sweep de contraste previo era grep-based. |
| `BookingCharges.tsx` | `emerald-600` **3.76:1**, `amber-600` **3.18:1**, `red-600` **4.18:1** sobre la card blanca. Se dispara en cualquier reserva con seña pagada — el caso típico. | Sin story. El componente que **maneja el dinero** de una reserva no se había renderizado nunca en un browser. |
| `ArticleShell.tsx:35` | Fecha del artículo: `text-gray-400` sobre `bg-gray-50` = **2.42:1**, la mitad del mínimo. | Sin story. El propio `STORYBOOK_COVERAGE.md` decía *"se storyean sus piezas (ArticleShell)"*. Era falso. |
| `verify/page.tsx:108` + `SuccessRedirect.tsx` | `text-slate-500` sobre la card oscura = **3.91:1** (ver bug #6). | Sin story. Y el mismo archivo ya usaba el valor correcto cuatro líneas más arriba. |

Los tres primeros son **la misma clase** que el sweep de a11y de `9d9948d` ya había cerrado en otros
lados (`status-visual.tsx` usa `-800`/`-700` justamente por esto). No los agarró porque **no se puede
auditar por grep lo que nadie renderiza**.

---

## La cobertura mintió. Dos veces.

Lo más incómodo del trabajo, y lo que más conviene entender.

| | qué afirmaba | qué pasaba de verdad |
|---|---|---|
| **1ra** | "266/266 archivos inventariados" | El inventario se generó antes de las 24 extracciones y del merge de SEO. **Faltaban 35 archivos** y sobraba un fantasma (un `.stories.tsx` contado como componente). El hueco dejó pasar `BookingDetailCard` con un bug real de `dlitem` y sin story. |
| **2da** | "Story directa: 223 — *Tiene story propia*" | **10 componentes no tenían NINGUNA story que los importara.** Entre ellos `BookingCharges` (maneja dinero) y el módulo `/jugadores` **entero**, que la tabla por dominio daba como `2 \| 2 \| 0`. |

**Las dos las encontró el review independiente. Ninguna la encontró quien escribió el código.**

La causa raíz de la segunda es la que enseña algo: el `classification` de `storybook-coverage.json`
nació como un **plan** (por eso hay entradas con `proposedStoryTitle: "… (a extraer)"`), y el documento
lo leyó como un **logro**. Y el script de verificación —el que decía `fantasma: 0 / faltantes: 0`—
comparaba **dos listas de rutas**: detectaba huecos en el inventario, pero daba por buena la
clasificación. Un componente marcado *"tiene story propia"* pasaba el check aunque no existiera una
sola story que lo importara.

Arreglar el conteo de archivos **no alcanzó**, porque el check nunca miraba lo que importa.

`scripts/verify-story-coverage.mjs` chequea eso: para cada componente declarado cubierto, busca un
`.stories.tsx` que lo **importe de verdad** — matcheando contra los *specifiers de import*, no contra
el texto del archivo, porque una mención en un comentario (`// reproduce QuickActions.tsx`) no es
cobertura, y contarla como tal es exactamente cómo se infla un número.

```bash
node scripts/verify-story-coverage.mjs   # exit != 0 si la cobertura declarada no existe
```

Los 10 huecos se cerraron escribiendo las stories que faltaban (y extrayendo las vistas de
`/jugadores`, que ni siquiera tenían un componente presentacional que storyear).

---

## Bugs de infraestructura (no de UI)

### La suite de e2e estaba caída, y por tres razones apiladas

Ninguna la causó este trabajo. Las tres estaban antes.

1. **11 INSERT crudos sin `starts_at`** en 9 archivos de e2e. El refactor de instantes físicos hizo la
   columna NOT NULL y la migración nunca llegó a la capa de e2e. El INSERT reventaba, el test moría
   **sembrando** sus datos (ni llegaba a probar nada) y dejaba la DB sucia.
2. **`turnogol_app` era NOLOGIN**: la app no podía ni conectarse. Postgres reporta un rol NOLOGIN con
   **el mismo mensaje que una contraseña incorrecta** (`password authentication failed`), lo cual
   manda la investigación al lado equivocado. El `ALTER ROLE … LOGIN` está documentado como paso
   manual fuera de las migraciones (para no versionar una contraseña) y nunca se había hecho en esta
   máquina. Ver `docs/operations/setup-local-roles.md`.
3. **`turnogol_worker` también NOLOGIN**: 169 `PostgresError` por corrida, desde pg-boss.

### `capture-screenshots.spec.ts` renombraba la tabla `bookings` de la base viva

Para fotografiar el error boundary, el spec hacía `ALTER TABLE bookings RENAME TO bookings_temp`. Dos
problemas, y el que lo hacía fallar era el menor:

- Usaba `DATABASE_URL`, que es el rol **`turnogol_app`** — restringido a propósito (migr. 037-039):
  tiene DML pero **no es dueño de las tablas**. Moría con `must be owner of table bookings`. O sea: el
  sistema de permisos **funcionando**.
- El `finally` revertía el rename con un **`.catch(() => {})`**. Si el rename-back fallaba, la tabla
  quedaba renombrada y **la base local rota para todo lo que viniera después — en silencio**.

Este spec solo era **1 fallo**, pero su tenant sucio arrastraba a **otros 6**. Ahora usa el DSN de
superusuario (el mismo canal que `scripts/seed-e2e.ts`) y el `finally` **grita** si no puede revertir.

### Time bomb en `concurrent-cancellation.test.ts` — explotó sola el 2026-07-11

El test fijaba el turno en `'2027-09-01'` y la política en `hours_before: 9999`, con el comentario
*"the 2027 booking is always inside the refund window"*. **Al revés**: `hours_before` es la *distancia
del deadline* — hay que cancelar con MÁS de esa anticipación para que haya reembolso. Un número más
grande es una política más **dura**, no más generosa (que es justo para lo que `setOutOfPolicy` usaba
20000, veinte líneas más abajo).

9999 h = 416 días. El turno de 2027-09-01 dejó de estar a esa distancia el **2026-07-11**, y desde ese
día el test empezó a fallar solo, sin que nadie tocara nada. Andaba por accidente mientras el
calendario lo dejaba. Ahora el turno se calcula a 30 días vista en cada corrida y la política es
`hours_before: 1`.

### El sitemap anunciaba dos 404 a Google

`sitemap.ts` emitía `/privacy` y `/terms`; las rutas en disco son `/privacidad` y `/terminos`. El
commit `5eb5eca` lo arregló pero **el test se quedó aserteando el bug**, así que la corrección salió en
rojo. Test actualizado.

### Flake de integración de 1 en 7

`insertAbonado` sacaba el `day_of_week` de `faker.number.int({min:0, max:6})` sobre **la misma cancha**
que devuelve `seedIsolationData`. Cuando el faker sacaba lunes, chocaba con el abonado que crea
`race-abonado-vs-individual.test.ts` y el test moría por una razón sin relación con lo que probaba.
Medido: **1 de 8 corridas en rojo antes; 10 de 10 en verde después.** La suite pasó de 84/85 a **85/85**.

### Vitest 3 rompió tipos sin romper el runtime

`vi.fn` unificó sus genéricos (`vi.fn<TArgs, TReturn>` → `vi.fn<T extends Procedure>`). **`pnpm test`
pasaba en verde y `pnpm typecheck` estaba rojo.** Quien corra solo los tests no se entera.

### Fuga de la capa de DB al bundle de browser

`TENANT_STATUSES` (una lista de 8 strings) vivía en `tenants.service.ts`, que importa `drizzle-orm` y
el cliente de DB. Cualquier componente presentacional que solo necesitara la lista **se arrastraba todo
el bundle de Postgres al browser** y reventaba con `Buffer is not defined`. Movido a `billing.types.ts`
(módulo puro, cero imports de valor).

---

## Tests que no podían fallar (encontrados y arreglados)

Vale la pena listarlos porque son el modo de falla más peligroso de este trabajo: dan verde y no
prueban nada.

- **`ControlledDatePicker`** hacía spread de `{...props}` **después** de `value`/`onChange`, así que un
  `value` fijo congelaba el estado interno. El `play` clickeaba, no pasaba nada, y el test pasaba.
  (`ControlledCombobox` tenía la misma bomba latente.)
- **`userEvent.upload()`** filtra los archivos contra el `accept` del input: la story del camino de
  error nunca llegaba a disparar el `onChange`.
- **`tests/unit/reservar-error-alerts.test.ts`** era un `readFileSync` + grep buscando el string
  `searchParams.error === 'slot_taken'`. Un `role="alert"` vacío habría pasado. Reescrito como render
  real.
- **Las stories de `StaffActions`/`QuickActions`** cerraban el menú antes del scan de axe (ver bug #5).
- **La story de `SuccessRedirect`** copió el gradiente real de la card y con eso **desactivó el check de
  contraste sin decirlo** (ver bug #6).

---

## Los cuatro flakes de la suite de stories, y el que era de verdad

La suite pasó de dar una story distinta en rojo cada corrida a pasar entera, tres veces seguidas. Eran
cuatro cosas apiladas:

1. **`testTimeout` sin setear**: el default de Vitest (5000 ms) contra stories con
   `findBy({ timeout: 5000 })`. Un findBy de 5s adentro de un test de 5s es una carrera perdida por
   definición. → `testTimeout: 30_000`.
2. **`asyncUtilTimeout` de testing-library en 1000 ms**: muy corto para los chunks de `next/dynamic`
   bajo carga. → `configure({ asyncUtilTimeout: 15_000 })`, en un solo lugar (`preview.tsx`).
3. **8 `getByRole('dialog')` sincrónicos**: cero espera contra una animación de entrada. → `findByRole`.
4. **La causa raíz: axe estaba midiendo colores que no existen.** El scan corre DESPUÉS del `play`, y
   Radix anima entradas y salidas. Un nodo pescado a mitad de transición tiene `opacity < 1` — y la
   opacidad diluye **el texto Y el fondo a la vez**. axe reportaba `fg #3d7e55` / `bg #d7e2db`:
   ninguno de los dos es un color del sistema, son `green-800` y `green-50` **desvanecidos por el
   fade**. Se manifestaba como un flake que caía en una story distinta cada corrida, según qué
   animación llegara a tiempo.
   → `context: { reducedMotion: 'reduce' }` en el browser de Playwright. `globals.css` ya tiene el
   bloque `@media (prefers-reduced-motion: reduce)` que deja las animaciones en `.01ms`: no hay estado
   transitorio que pescar.

> El `reducedMotion` destapó, de paso, algo bueno: la story `Reveal > AntesDeIntersectar` probaba el
> estado "todavía no revelado". Pero `Reveal` hace **lo correcto** ante `prefers-reduced-motion` —
> muestra el contenido de inmediato, porque esconderle contenido a alguien que pidió menos movimiento
> sería un bug de accesibilidad grave. O sea que bajo el runner ese estado **no existe**, y la story
> estaba afirmando algo que el componente, por diseño, nunca hace.

---

## Decisiones de arquitectura que se pagaron solas

### Las Server Actions se inyectan por prop

Antes de refactorizar, se probó el camino barato: mockear el módulo `'use server'`. **`sb.mock()` no
sirve**: en esta instalación su cuerpo es literalmente `() => {}` — un no-op. Y aunque funcionara, el
automock tiene que *cargar* el módulo real para enumerar sus exports, lo que arrastra
`request-context` → `node:async_hooks` → `Module "node:async_hooks" has been externalized for browser
compatibility`.

La inyección por prop era **obligatoria, no una preferencia**. La guarda que lo sostiene es una regla
de ESLint (`no-restricted-imports` de `@typescript-eslint`, con `allowTypeImports: true`) sobre
`src/**/*.stories.tsx`: importar un valor desde `**/actions`, `@/shared/db`, `drizzle-orm` o un
`*.service` **rompe el lint**. Convierte la disciplina en falla de build, no en convención.

### Una story sin su contenedor real miente

**axe mide el contraste contra el fondo que le pongas.** Un fondo falso da un veredicto falso en las
dos direcciones: reporta bugs que no existen y **tapa los que sí**.

Los dos casos, medidos: `ReservasPolicyForm` suelto sobre `bg-background` fallaba, pero en la app vive
dentro de `.card-premium` (superficie blanca), donde el mismo texto **sí** pasa — bug inventado. Y
`SuccessRedirect` con el gradiente real de su card **pasaba en verde tapando un 3.91:1** — bug tapado.

---

## Números

Todos medidos, con el comando al lado.

| Gate | Comando | Resultado |
|---|---|---|
| Tipos | `pnpm typecheck` | ✅ 0 errores |
| Lint | `pnpm lint` | ✅ 0 errores |
| Unit | `pnpm test` | ✅ **208 archivos / 1530 tests** |
| Integración | `pnpm test:integration` | ✅ **85 archivos / 566 tests** *(era 84/85: el flake cayó)* |
| Aislamiento | `pnpm test:isolation` | ✅ **111 tests** (bloqueante por política del repo) |
| Build app | `pnpm build` | ✅ **52/52 páginas estáticas** |
| Build Storybook | `pnpm build-storybook` | ✅ estático OK |
| **Stories** | `pnpm test:storybook` | ✅ **864/864** (227 archivos) |
| **e2e** | `playwright test --project=chromium --workers=1` | ✅ **81 passed / 5 skipped / 0 failed** (9,3 min) |
| Cobertura real | `pnpm qa:coverage` | ✅ **0 huecos** |

### Sobre el e2e: correr en paralelo miente

La suite se auto-contamina. Medido en el mismo commit, **antes** de los fixes de abajo:

| | pasan | fallan |
|---|---|---|
| `--workers=6` (default) | 48 | 31 |
| `--workers=1` (serial) | 71 | 7 |
| `--workers=1` (serial, **después de los fixes**) | **81** | **0** |

Los 6 workers comparten **una sola DB y un solo seed** (mismos tenant/court IDs), así que se pisan
entre ellos. Eso es deuda pre-existente del diseño del e2e y **no se tocó** (queda en
[Pendientes](#pendientes)).

Pero los 7 fallos del **run serial** sí eran arreglables, y **los 7 salían de un solo spec**:
`capture-screenshots.spec.ts`, con tres causas apiladas.

1. **DDL de owner con el rol de la app.** El spec hace
   `ALTER TABLE bookings RENAME TO bookings_temp` para fotografiar el estado de error de la grilla,
   usando `DATABASE_URL` — que es `turnogol_app`, un rol restringido **a propósito** (migr. 037-039) y
   que no es dueño de la tabla. El rename fallaba; y el `finally` que lo revertía tenía un
   `.catch(() => {})`, así que el fallo era **silencioso**. Fix: `SEED_ADMIN_URL` para el DDL, y el
   `finally` ahora **tira** en vez de tragarse el error.

2. **Le consumía la fixture al fresh admin.** El spec maneja el wizard de onboarding hasta el final
   (crea "Complejo UX Audit") para sacarle fotos. El `e2e-admin-fresh` es una fixture cuyo valor entero
   es **no** tener el onboarding completo: a partir de ahí `/onboarding` redirige a `/dashboard` y los
   3 tests de `onboarding.spec.ts` fallan sin que nadie haya tocado el wizard. El seed ya limpiaba
   esto, pero corre **una sola vez** en el global setup — no protege de una contaminación que pasa
   *durante* la corrida. Fix: el `afterAll` llama a `deleteFreshAdminTenants()`
   (`tests/e2e/_helpers/fresh-tenant-cleanup.ts`, extraído del seed para que el orden de FK no se
   desincronice).

3. **Dejaba reservas reales del jugador compartido.** También camina el flujo público de reserva
   (formulario → checkout MP → éxito), o sea que crea bookings **de verdad** para el player
   cross-tenant. `player-bookings.spec.ts` hace
   `getByRole('button', {name: 'Cancelar'}).first().click()` y terminaba cancelando la reserva
   equivocada. Fix: snapshot de los `booking.id` preexistentes en el `beforeAll` y borrado del delta
   en el `afterAll`.

Los tres eran bugs del harness de tests, no del producto — pero mientras existieran, **cualquier**
medición de la salud del e2e era ruido.

---

## Validación de la app real — cero regresiones

Las extracciones presentacionales tocaron **28 páginas**. Era el riesgo más grande del trabajo.

> **Nota metodológica, porque la primera medición fue inválida.** `playwright.config.ts` tiene
> `reuseExistingServer: !CI` en el puerto fijo 3000. La primera comparación contra el commit base
> reusó **mi dev server**, que servía MI rama: la conclusión de "cero regresiones" no estaba probada,
> aunque resultó ser correcta. Se rehízo liberando el puerto entre cada corrida.

Y lo más importante: **la inyección de Server Actions funciona end-to-end**. Se cargó `/login` con
credenciales inválidas y la app respondió *"Email o contraseña incorrectos."* — o sea que el `page.tsx`
inyecta la action al componente extraído, `useFormState` la recibe, se ejecuta contra la DB y renderiza
el error. El refactor no es solo "compila": **anda**.

---

## Pendientes

Lo que **no** está hecho:

1. **QA visual con `agent-browser`**: se corrió sobre el Design System en `mobile-primary` (393×851):
   119 celdas, **104 PASS / 15 FAIL**, y **0 overflow horizontal, 0 targets < 44px, 0 imágenes rotas**.
   Los 15 FAIL eran exactamente las stories cuyos `play` ya estaban rojos — o sea que el sweep visual
   **no encontró ningún bug nuevo** más allá de lo que axe ya reportaba, que es la señal que uno busca.
   **Falta el sweep en los otros 5 viewports y sobre los dominios de negocio.**

   > **Un bug que tuvo la propia herramienta**, y vale contarlo: la primera corrida reportó **99
   > "console-error" de los cuales CERO eran de la story que estaba mirando**. `agent-browser console`
   > devuelve el log **acumulado de la sesión**, no el de la página actual: en cuanto una story tiraba
   > un error, todas las siguientes lo heredaban. Faltaba un `console --clear` **antes** de cada
   > navegación (después borraría los errores del propio render, que es justo lo que se quiere
   > capturar). Una herramienta de QA que inventa hallazgos es tan inútil como una que los tapa.

2. **Regresión visual con baselines**: no se establecieron. Chromatic queda documentado como
   integración opcional — **no hay credenciales y no se inventó un token**.

3. **El e2e se auto-contamina en paralelo** (48/31 con 6 workers, contra 81/0 en serial). El fix real
   es aislar el seed por worker: tenant/court IDs derivados del `workerIndex` en vez de constantes
   compartidas. Es deuda del diseño del e2e, anterior a este trabajo, y **no se tocó** — arreglarlo es
   un esfuerzo propio. Hasta entonces, **la única medición honesta del e2e es `--workers=1`**.

4. **`DashboardSkeleton`** (el fallback del `Suspense` de `MetricsDashboardLoader`) queda sin cubrir.
   Solo se ve mientras baja el chunk de JS, y en el runner esa ventana es de cero frames. La única
   forma de storyearlo sería exportarlo — cambiar código de producción para que exista una story, que
   es justo lo que este trabajo se comprometió a no hacer.

5. **`text-slate-500` en 27 lugares más** (`/para-complejos`, `/precios`, `mock-mp`, `global-error`).
   Sobre `#020617` da **4.24:1**: por debajo de AA para texto normal. **No se tocó** porque
   `src/app/(business)/precios/*` tiene cambios en curso del dueño del repo y pisarlos sería
   destructivo. Queda medido y reportado.

---

## REQUIERE INPUT

### 1. La ficha del jugador no tiene Abonados, pero la spec dice que sí

`CLAUDE.md` describe la ficha de `/jugadores/[playerId]` como *"stats + indicador de softban +
**Abonados** + historial"*. El código **nunca fetchea abonados**: no hay ningún query de abonados en
`src/app/(admin)/jugadores/queries.ts`, y la page no los renderiza.

Salió al extraer la vista para poder storyearla: no había forma de escribir la story "con abonados" /
"sin abonados" porque el estado no existe. Es una divergencia real entre la spec de dominio y el
producto. **No se resolvió**: o se agrega la sección (con su query, en un esfuerzo aparte), o se
corrige la doc para que deje de prometer algo que el producto no tiene.

### 2. Testimonio fabricado, vivo en producción

`src/app/(auth)/login/page.tsx:43-46`:

> *"En tres meses subimos la facturación 40% sin contratar a nadie."*
> — Marcelo Pérez · Complejo San Martín, Mendoza

"Marcelo" es el nombre de la persona Owner de `doc3`, el producto está **pre-launch** y no existe
ningún "Complejo San Martín" en la base ni en los fixtures. Es la misma clase de claim que el commit
`5eb5eca` ("fix(copy): remove fake claims") sacó de `/para-complejos`, pero ese sweep no llegó a la
página de login.

Atribuye una **cifra concreta a una persona y un negocio con nombre propio**, así que no lo asimilé a
los "casos discutibles" de MASTER §9. **No lo toqué: es una decisión de negocio.**

---

## Estado final

- **Stories**: `pnpm test:storybook` → **864/864** (227 archivos), cero FAIL.
  La suite creció de 793 a 864 al cerrar los 10 huecos de cobertura que destapó el review.
- **Cobertura**: `pnpm qa:coverage` → **0 huecos**. Los 300 archivos inventariados, y todo lo que se
  declara cubierto tiene una story que lo importa.
- **e2e**: `playwright test --project=chromium --workers=1` → **81 passed / 5 skipped / 0 failed**.
  Los 7 fallos del run serial salían todos de `capture-screenshots.spec.ts` (tres causas apiladas, ver
  [Números](#números)). **Correr en paralelo sigue dando números peores por contaminación entre
  workers** — deuda pre-existente del diseño del e2e, no de este trabajo.
- **Lo que NO se commiteó de este esfuerzo**: nada. Lo único que quedó afuera son archivos de un
  esfuerzo de copy en curso del dueño del repo (`(business)/precios/*`, `content/`, `docs/gtm/`,
  `docs/audit/PROGRESS.md`) — pisarlos hubiera sido destructivo.
