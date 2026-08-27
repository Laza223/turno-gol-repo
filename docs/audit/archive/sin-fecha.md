# Auditoría TurnoGol — historia sin-fecha

Archivado el 2026-08-27 desde `docs/audit/PROGRESS.md`, sin editar una coma.
Es historia: describe lo que se hizo en su momento, **no** el estado de hoy.
Para lo vigente: `git log`, `gh pr list`, `gh run list --workflow CI`.

---

## Log de sesiones

## TICKET 2 — CERRADO 100% (5/5 validadores huérfanos revisados)

| #   | Validador                 | Resultado                                                                                                                                                                |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `parseRouteUuid`          | Cableado en `player/bookings/[id]/status/route.ts`                                                                                                                       |
| 2   | `bookingResponseSchema`   | Cableado en 5 Server Actions de `reservas/actions.ts`                                                                                                                    |
| 3   | `cashFlowResponseSchema`  | Fix de schema (`abonadoId` faltante) + cableado en `createCashFlowAction`; `daySummaryResponseSchema`+`dailyCashCloseResponseSchema` borrados (sin surface HTTP posible) |
| 4   | `openingHoursSchema`      | Borrado — NO REPRODUCE, finding #36 ya resuelto por `horariosSchema`                                                                                                     |
| 5   | `runRequestObservability` | Sin tocar — decisión de auditoría previa (4-29), retrofit grande fuera de scope                                                                                          |

Nada commiteado. Archivos tocados: `src/app/api/player/bookings/[id]/status/route.ts`, `src/app/(admin)/reservas/actions.ts`, `src/app/(admin)/caja/actions.ts`, `src/modules/cashflow/cashflow.schema.ts`, `src/modules/tenants/tenant.schema.ts`.

---

## Fase 3 — BLOQUEADA (no arranca sola)

Entrada del contrato (`decisiones-de-fase-v2.md:111`): **(1)** máquina de estados del slot documentada cubriendo TODAS las combinaciones reales de reserva+seña+cancelación (no solo los 6 estados felices) — no existe el doc; **(2)** prototipo navegable mostrado a ≥3 dueños/encargados prospecto — no hecho, es venta. Regla anti-túnel (§3): tampoco Fase 2 cerró del todo — su propio criterio de salida #4 ("demo comercial usada en ≥1 reunión real") sigue pendiente, es tarea de Lazar, no de código.

**Próximo paso ofrecido, pendiente de que Lazar lo pida:** redactar el borrador de la máquina de estados del slot (leyendo `bookings`/`deposit_status`/cancelaciones reales) como insumo técnico del gate — no reemplaza el prototipo ni la validación con prospectos, que siguen siendo responsabilidad de Lazar.

## B8 (parte 1) — La suma que concatena no existía; el candado que faltaba, sí

**La premisa del plan está REFUTADA.** El plan de B8 decía que de los ~193 casts
de SQL crudo, _"al menos uno es donde Postgres puede devolver un número como
texto y la suma concatena"_, y señalaba `payment.service.ts:968`. Se buscó la
clase completa sobre los caminos de plata (5 slices, ~100 archivos) y **no hay
ninguno**.

Lo que sí se confirmó, contra el código y no contra el plan:

- **El bug es posible en este repo.** `node_modules/postgres/src/types.js` parsea
  a JS number solo los oids `[21, 23, 26, 700, 701]` — int2, int4, oid, float4,
  float8. int8/bigint (20) y numeric (1700) llegan como **string**. Y los dos
  pools de `src/shared/db/client.ts` (:54 y :151) se crean sin opción `types`,
  así que ese default aplica en el runtime web y en los workers.
- **No hay ningún caso sin cubrir.** `payment.service.ts:968` ya envuelve en
  `Number(...)` y encima declara el tipo honesto (`string | number`), así que la
  pista del plan apuntaba a un sitio que estaba bien.
- Dos candidatos que un grep marca como sospechosos son falsos positivos:
  `booking.debts.ts:61` **sí** tiene `::int`, pero cinco líneas más abajo, sobre
  el `COALESCE` que envuelve al `SUM` — un grep line-local no lo ve. Y el de
  `:79` vive dentro de un `HAVING`: es aritmética 100% en Postgres, nunca cruza
  a JS.

**Lo que sí estaba mal, y no era lo que se buscaba.** Seis `sql<number>` en
`report.service.ts` (:58, :72, :73, :94, :111, :123) envuelven un
`CAST(... AS BIGINT)`. El tipo mentía: en runtime son strings. No producían un
bug **hoy** porque todos los consumidores llaman `Number()` — pero TypeScript
estaba tapando el agujero en vez de señalarlo, y el próximo que escribiera
`total + x` no iba a recibir ningún aviso.

Pasaron a `sql<string>`. El `BIGINT` se deja como está y es deliberado: los
montos son centavos de ARS e int4 se satura arriba de ~$21M de pesos, así que
castear a `::int` sería el arreglo equivocado. **Typecheck en verde después del
cambio es la prueba** de que todos los consumidores ya convertían: un
`reduce((acc, r) => acc + r.total, 0)` con `total: string` no compila.

**El candado:** `tests/unit/sql-number-type-honesty.test.ts` falla si un
`sql<number>` envuelve un agregado que Postgres devuelve como bigint/numeric sin
un cast que el driver sepa parsear. Hasta ahora el repo estaba limpio **por
convención** — cada sitio se acordó de poner `::int` o de envolver en `Number()`
—, y una convención sin candado dura hasta el primer despistado. Control
negativo corrido: revirtiendo un solo sitio, el test lo caza con archivo:línea y
el arreglo concreto.

Alcance del candado, explícito: cubre `sql<number>`, donde el tipo y el SQL están
pegados y se verifican leyendo una sola expresión. **No** cubre
`tx.execute<{x: number}>` ni `as unknown as Array<{x: number}>` — ahí están
separados, y adivinar qué columna corresponde a qué campo produce falsos
positivos. Un candado con falsos positivos termina desactivado, así que se dejó
ajustado en vez de amplio.

### Lo que queda de B8

Los **204** casts `as unknown as` (el plan decía 193; el número creció) siguen
ahí. Con la premisa del bug refutada, lo que queda es higiene de tipos: pasarlos
al genérico `tx.execute<T>()`, que Drizzle ya expone. Vale hacerlo, pero es
churn mecánico sin defecto conocido detrás — conviene decidir explícitamente si
paga las 3 sesiones que estimaba el plan. Falta también **B8d** (el gate de
Prettier, que hoy no corre en CI).
---

## B8d — El gate de Prettier, que estaba configurado y no corría ✅ CERRADO

`.prettierrc` existía desde siempre y `ci.yml` **confesaba por escrito** que
`pnpm format:check` no estaba cableado, "porque enchufarlo exige un reformateo
masivo, que es un esfuerzo aparte". Ese esfuerzo es este. Un gate configurado
que no corre no es una convención floja: es deriva creciendo sin nada que la
frene, y el número lo muestra — el comentario decía ~716 archivos y al medirlo
hoy eran **1071**.

### Tres cosas antes de reformatear, no una

1. **La config peleaba con el código.** `.prettierrc` fijaba
   `trailingComma: "es5"` contra un repo escrito en estilo `"all"` — que además
   es el **default de Prettier 3**. Se alineó la config al código, no al revés:
   nadie eligió `es5` deliberadamente. Medido: baja el diff de 770 a 668
   archivos sobre `src/`. Solo el 13%, así que el reformateo masivo era
   inevitable igual — pero peleaba de gratis.
2. **No existía `.prettierignore`.** Se creó, cubriendo generados (`.next/`,
   `coverage/`, `e2e-results/`, `visual-results/`, `semgrep-sarif/`,
   `playwright-report/`, `scripts/demo/out/`, `**/*-snapshots/`) y el lockfile.
   Y, a propósito, **las migraciones**: `src/shared/db/migrations/` y
   `supabase/migrations/` quedan afuera porque por regla del repo no se editan
   una vez aplicadas — reformatearlas sería tocar archivos inmutables.
3. **El scope estaba desalineado.** `format` cubría `src/` mientras `lint`
   cubría `src/ tests/ scripts/`. Ahora los tres scripts miran lo mismo: un gate
   que ignora `tests/` deja crecer la deriva justo donde más archivos hay.

### Lo único que el reformateo rompió

`tests/unit/use-booking-realtime.test.ts`: un objeto que estaba en una línea pasó
a cinco, y el `// eslint-disable-next-line @typescript-eslint/no-explicit-any` de
arriba **dejó de cubrir** los dos `as any`, que ahora viven en las líneas 14 y 15.
ESLint lo cazó (2 errores). Se pasó a un par
`/* eslint-disable */ … /* eslint-enable */` alrededor del bloque: misma
supresión que ya había, con el alcance correcto.

Vale como gotcha general: **un reformateo masivo mueve las directivas de
supresión de una sola línea**. El detector es correr ESLint después de Prettier,
no antes.

### Evidencia

1071 archivos reformateados. `pnpm format:check` limpio · `pnpm lint` limpio ·
`pnpm typecheck` limpio · `pnpm knip` limpio · **3234** unit · **907**
integración · **166** isolation · **1066** stories en 264 archivos (con axe).

El gate quedó como primer step del job `Lint & Types`, antes de lint y typecheck:
es el más rápido de los tres y el de arreglo más barato (`pnpm format`), así que
no tiene sentido hacer esperar a nadie detrás de un typecheck para avisarle que
le faltó una coma.

### Observación aparte, sin relación con B8d

`pnpm test` falló **una vez de tres corridas** en esta sesión, con 1 test
distinto cada vez y verde al re-correr. Uno se identificó
(`tests/unit/e2e-endpoint-guard.test.ts`, que muta `process.env` y se pisa bajo
paralelismo); los otros dos no se llegaron a capturar. No lo causa este cambio
—pasaba antes— pero es un flake real bajo carga y conviene fichar el archivo
exacto la próxima vez que aparezca, no re-correr y seguir.

---

## B10 (parte 1) — /caja traía toda la deuda impaga para mostrar un número

**El defecto, verificado contra el código.** `getStreetMoney` no tiene `LIMIT`
en ningún lado: dispara `getDebts`, `listOpenTabs` y `listTenantInscriptionDebts`
en paralelo —las tres sin techo—, concatena todo en JS y ordena en JS. Y no lo
llamaba solo `/caja/deudas`, que es donde las filas se muestran: lo llamaban
también `caja/page.tsx:46` y `home.service.ts:316`.

En `/caja` el resultado se usaba **para una sola cosa**: `sumStreetMoney(...)`,
el número del encabezado. O sea que cada carga de la pantalla de plata
materializaba la lista completa de deuda impaga para sumarla. Y la deuda impaga
no se estabiliza — crece con el uso del complejo —, así que el costo de esa
pantalla crece con el negocio.

**El arreglo:** `getStreetMoneyTotal(tenantId, tx)` calcula el mismo número en
Postgres sin traer una fila, y `/caja` pasa a usarlo. `/caja/deudas` sigue con
`getStreetMoney`, que es donde las filas hacen falta.

**El precio, y cómo se paga.** El total en SQL repite los predicados de las tres
funciones de origen, y el docstring del módulo advierte explícitamente contra
tener dos lugares que calculen el total. Por eso no queda librado a la
disciplina: `tests/integration/street-money-total.test.ts` siembra las tres
fuentes y falla si las dos rutas no dan exactamente lo mismo. **Control negativo
corrido**: sacando el descuento de la seña del SQL, el test se pone rojo con
`expected 700000 to be 500000`. La duplicación pasa de riesgo silencioso a
regresión que se ve.

**La home NO se tocó, a propósito.** Ahí `streetMoneyRows` sí se usa para armar
las alertas de turnos impagos del día (`home.service.ts:328`), así que cambiarla
al total no alcanza: hace falta una consulta de deuda filtrada por fecha, que es
trabajo aparte. `/caja` es la pantalla frecuente y es la que gana acá.

### Correcciones al plan de B10

- 🔴 **`with-auth.ts` NO es código muerto.** El plan dice "0 consumidores".
  Falso: lo ejercitan `tests/unit/middleware.test.ts` y
  `tests/unit/route-wrappers-request-context.test.ts`, y este último lo usa como
  **implementación de referencia** (`:119-124`) para después verificar
  estáticamente que `withTenant`/`withPlayer` abren el contexto de request igual.
  Knip no lo marca porque tiene consumidores reales, no por un blindspot.
  Borrarlo debilitaría el guard de los otros dos wrappers. **No se toca.**
- El conteo de `getStreetMoney` sí era correcto, y el problema era peor de lo
  descripto: no es solo `/caja/deudas`, son tres pantallas.

### Lo que queda de B10

- 🟡 `api/status/route.ts` sin auth (info disclosure de estado de infra).
- 🟡 `api/e2e/create-booking/route.ts` con gate por `NEXT_PUBLIC_E2E`, que se
  inlinea en build.
- **La UI que miente**: `listTenantBookings` trunca a `LIMIT 200` mientras
  `countTenantBookingsByStatus` cuenta sin techo — las píldoras pueden decir
  "Completadas (740)" y la lista mostrar 200. Verificado en
  `reservas/queries.ts:89-148`.
- Paginación con cursor real para `listTenantClients`, `/mis-reservas`,
  `getCashFlowsForExport` y `getAbonados`.
- Las 12 páginas con `extractAuthUser` crudo (hoy no es un agujero: son
  pantallas operator-level donde admin y manager pasan igual).

---

## Mediciones que corrigieron el diagnóstico del report

Tres hipótesis se cayeron con control negativo antes de escribir código. Van registradas porque
cada una habría llevado a un fix equivocado:

1. **"`instrumentation.ts` y `middleware.ts` en la raíz los ignora Next 16 con `src/app`"** —
   REFUTADO. `GET https://turnogol.app/verify` (dentro del `matcher`) responde `X-Request-Id` y
   `/precios` (fuera) no: el middleware raíz corre en producción. Y un probe dentro de
   `register()` sobre `next dev` imprimió `register() ENTRA, runtime=nodejs` +
   `installZodLocale OK`.
2. **"El locale de Zod no se instala"** — REFUTADO, y el hallazgo real es otro: se instala, y
   desde un route handler `globalThis.__zod_globalConfig.localeError` está seteado, pero los
   mensajes de ESE handler siguen saliendo en inglés. Llamando `installZodLocale()` desde un
   módulo del grafo de la app, los mismos schemas pasan a español. O sea: `instrumentation.ts`
   se bundlea en otro layer y configura otra copia de zod. **El locale global no sirve como red
   de seguridad** — medición completa en el docstring de `zod-locale.ts`.
3. **"El soft-404 de `[slug]` es la caché de ISR"** — REFUTADO. Aislado con 3 rutas sonda, sin DB
   de por medio:

   | Sonda                   | `notFound()` en | `loading.tsx` | Status     |
   | ----------------------- | --------------- | ------------- | ---------- |
   | `/probe-plain`          | page            | no            | **404**    |
   | `/probe-loading`        | page            | sí            | **200** ❌ |
   | `/probe-loading-layout` | layout          | sí            | **404** ✅ |

   El `loading.tsx` mete un `<Suspense>`, Next arranca a stremear con el 200 ya emitido y el
   `notFound()` posterior llega tarde. El layout renderiza fuera del boundary. (La primera
   corrida de esta medición salió con Postgres local caído y daba 500/200 por el throw de la
   query, no por `notFound()`; por eso se rehizo con sondas que no tocan la DB.)

## Patrones sistémicos

**S1 · Mensajes de Zod en inglés** (cubre 6 hallazgos: Checkout P0, Register/Onboarding,
Canchas/Equipo, Caja·Productos, Perfil del jugador). Mensaje explícito en todo `.max()`/`.min()`
que puede llegar a la pantalla, en vez de delegar en el locale global (ver medición 2):
`primitives.ts` (`boundedText`, cubre 31 usos en 8 archivos) · `tenant.schema.ts` (5 campos) ·
`court.schema.ts` · `reservar/actions.ts` · `settings/equipo/actions.ts` · `perfil/actions.ts` ·
`register/actions.ts` · `canteen.schema.ts`. El docstring de `zod-locale.ts` quedó reescrito con
la medición para que nadie vuelva a asumir la red de seguridad.

Agujero de test cerrado: `tests/setup.ts` llama `installZodLocale()`, así que en tests todo salía
en español y CI nunca vio el bug. `tests/unit/zod-messages-es.test.ts` fuerza el locale INGLÉS
(con control negativo del propio test) para que solo pase lo que tiene mensaje explícito.

**S2 · El banner de push interceptaba clicks** (4 hallazgos, uno 🔴).
`PushNotificationManager.tsx` pasa de `fixed … z-40` a un elemento **en flujo** dentro del
`<main>` de `admin-layout-shell.tsx` (se saca de los dos puntos de montaje de
`(admin)/layout.tsx`). Flotando tapaba —e interceptaba el click de— los links del sidebar en
desktop (caja de 400px sobre un `<aside>` de 240px sin `z-index`), los tabs de `AdminBottomNav`
en mobile (mismo `z-40`, ganaba por orden de DOM) y el "Guardar" de `/settings/avisos` en
viewports bajos, donde el click se perdía **sin ningún feedback** porque `useFormStatus` nunca
llegaba a marcar `pending`. Ya se había intentado achicarlo (ENS-11) y desmontarlo al descartar:
en flujo la clase se cierra entera y no quedan offsets que mantener sincronizados con altos de
barra hoy hardcodeados en 3 lugares distintos.

**S3 · Soft-404 del catch-all `[slug]`** (3 hallazgos). `src/app/(public)/[slug]/layout.tsx`
nuevo: resuelve el complejo y `notFound()` si no existe, fuera del boundary de `loading.tsx` (ver
medición 3). Cubre `/{slug}`, `/disponibilidad` y `/reservar`. Solo chequea EXISTENCIA — el 200
del complejo suspendido es deliberado y sigue en `page.tsx`. `getPublicTenant` queda envuelto en
`cache()` de React, así que el layout no agrega una consulta (la page y `generateMetadata` ya la
pedían dos veces). Aparte: `redirects()` en `next.config.ts` para `/privacy → /privacidad` y
`/terms → /terminos`, que caían al catch-all — verificado en dev, 308.

## Críticos puntuales

- **F1 · `/ingresar` daba de alta cuentas sin declaración jurada +18** — `auth.service.ts`:
  `shouldCreateUser: false`. El `otp_disabled` de un email inexistente se mapea a `{ ok: true }`
  para no filtrar qué emails están registrados (mismo criterio que `signInWithPassword`), con
  `flow: 'reaccess_unknown_email'` como único rastro (`breadcrumbs.ts`).
  `signInWithPlayerMagicLink` (el alta real, con `agreed_terms`) no se toca.
- **F2 · `date` calendáricamente inválido crasheaba el checkout** — `[slug]/reservar/page.tsx`
  usa `isValidCalendarDate` (helper que ya existía, y que el `actions.ts` del mismo directorio ya
  importaba) en lugar del `DATE_RE`, que solo miraba el formato. El crash real estaba en el
  `${date}::date` de `public.service.ts`.
- **F3 · `bookingId` no-UUID crasheaba 4 páginas** — `isUuid` exportado desde `primitives.ts`
  (donde ya vivía el `UUID_RE` canónico, duplicado en 10 archivos) y usado en
  `reserva/[bookingId]/{exito,pendiente,error}` y en `(admin)/reservas/[id]` → `notFound()`.
  Precedentes copiados: `verificar/page.tsx`, `super-admin/tenants/[id]/page.tsx`.
- **F4 · El paso Canchas del onboarding duplicaba** — **el diagnóstico del report era falso**: el
  botón SÍ se deshabilita (`useTransition` + `<Button isLoading>`, igual que el Paso 1). Lo que
  faltaba era el guard de idempotencia server-side que el Paso 1 sí tiene (comentario `#35`, para
  el reenvío tras "Volver"). `createWizardCourtsAction` ahora saltea los drafts cuyo nombre ya
  existe (trim + case-insensitive) y sigue permitiendo agregar canchas nuevas en una revisita.
- **F5 · Completar con nota de deuda tumbaba `/reservas`** — la nota viaja en el MISMO UPDATE que
  la transición (`completeBooking`, 5º parámetro `appendNote`), no en una segunda sentencia que
  `enforce_booking_invariants_fn` (migr. 070) rechaza por estado terminal. Patrón copiado de
  `applyNoShow`, que ya había resuelto lo mismo para la captura de seña. **Migración no tocada.**
- **F6 · Logo de R2 crasheaba el perfil público → NO REPRODUCE.** `media.turnogol.com` ya está en
  `remotePatterns` y en el `img-src`. Riesgo residual real:
  `docs/operations/dns-turnogol-app.md` manda migrar a `media.turnogol.app`, y ahí el crash
  aparece de verdad (`next/image` tira y se lleva puesta la página entera, no solo la imagen).
  Fix preventivo: el hostname sale de `R2_PUBLIC_BASE_URL` — el mismo env que usa `publicUrl()` —
  y alimenta `remotePatterns` y el CSP, así config y env no pueden divergir.
- **F7 · El cron auto-complete rompía Torneos** — `AND b.tournament_id IS NULL` en
  `autoCompleteOverdueBookings`. Tiene que ser preventivo: en `completed` el trigger de la 070
  vuelve la fila inmutable y no hay vuelta atrás. De paso cierra el doble-booking derivado
  (`booking.overlap.ts` filtra por los mismos dos estados).
- **F8 · Banner tapando "Guardar" en `/settings/avisos`** → lo cierra S2.

## No reproducen (verificado contra el código, no contra el report)

- **`/analiticas` sin guard de rol.** El report decía que `requireOperatorStaff` solo aparecía en
  un comentario. Es falso: se llama en `analiticas/page.tsx:78`. Lo único cierto era el comentario,
  que decía que el guard "lo da el layout de (admin)" — y el layout solo resuelve `getStaffRole`
  para el chrome, no corta acceso. Corregido el comentario para que apunte al guard real; ya había
  mandado a auditar el layout dos veces.

## Aplicados

**Estado vacío que miente cuando la página está fuera de rango** (2 hallazgos, misma clase). El
EmptyState miraba solo el array de la página actual, no si existían filas en otras páginas.
`/jugadores?pagina=999` decía "Todavía no tenés clientes" con el link "Anteriores" al lado, y
`/explorar?offset=12` mostraba "No encontramos complejos" mientras el toolbar seguía anunciando
"6 complejos". Ahora las dos vistas distinguen "no hay nada" de "esta página no tiene nada" y
ofrecen volver al principio (`JugadoresView.tsx`, `EmptyResults.tsx` + `explorar/page.tsx`).

**Teléfono argentino sin validar** (`/register` + onboarding paso 1). El `PhoneInput` manda el
valor ya compuesto con el código de país (`"+54 12345"`), así que las reglas que contaban
CARACTERES contaban el prefijo como dígitos del abonado y un número de 5 dígitos pasaba. Primitiva
compartida `phone` en `primitives.ts` que cuenta DÍGITOS (10 a 15: con +54 son 8 nacionales, el
mínimo del checklist; 15 es el techo de E.164), usada por `tenant.schema.ts` y
`register/actions.ts`; el `phoneRegex` local se fue. Test: `tests/unit/phone-primitive.test.ts`.

**Abonado con fecha de inicio pasada** — decisión del dueño: **bloquear**. `min={todayART()}` en el
DatePicker y `.refine(startsOnNotPast)` en los DOS schemas del server (alta y preview), porque el
cliente no es la barrera. Antes se generaban reservas retroactivas en `confirmed` que el trigger de
24h pasaba a `completed`: partidos "jugados" que nunca ocurrieron, contando plata, y que ni pausar
ni cancelar el abonado limpian (las dos acciones solo borran `date >= hoy`).

**El teléfono se vaciaba al volver del preview** (nuevo abonado). Vivía solo en el FormData
mientras Nombre y Precio estaban en estado: al remontar el form tras un error de validación el
campo salía vacío y el segundo intento fallaba con un error no relacionado. Ahora es estado y
vuelve como `defaultValue`.

**Apellido de solo espacios** (`/perfil`). `.trim()` antes del `.min(1)`: una cadena de 5 espacios
tenía length 5, pasaba, y la UI decía "Perfil actualizado" con el avatar de iniciales roto.

**`BanPlayerDialog` no se reseteaba al reabrir.** El reset vivía en el handler que Radix invoca
cuando el diálogo cambia su propio estado — nunca cuando el padre hace `setOpen(true)`. Ahora se
ajusta en la transición de `open` DENTRO del diálogo, así cubre a cualquier caller (el precedente
de `LinkContactDialog`, que resetea en su botón disparador, deja el bug latente para el próximo que
lo monte). Va como ajuste durante el render, no en un efecto: `react-hooks/set-state-in-effect`
lo prohíbe — un primer intento con `useEffect` dejó el lint rojo y se rehizo.

**Invitación de staff: el cartel mentía** — decisión del dueño: el invitado opera desde el minuto
cero, se arregla el copy. Decía "Recibirán un email para activar su cuenta" y no hay ninguna
activación: la fila nace `is_active=true` y no existe flujo que la active al aceptar (ponerla en
`false` dejaría al invitado bloqueado para siempre). Ahora dice que ya puede entrar y que el email
es para poner la contraseña.

**Tabla de goleadores: el aviso de goles sin autor era inalcanzable.** Vivía solo en el footer de
la tabla real, o sea en código muerto mientras no hubiera ni un goleador cargado — justo el caso en
que más falta hace. Ahora el EmptyState lo dice.

**"Próximos" de Mis reservas se definía solo por fecha.** Una reserva de HOY ya jugada o expirada
seguía ahí, mezclada con turnos futuros, contradiciendo al contador "Tenés N turnos por jugar" de
la misma pantalla, que ya filtraba por `UPCOMING_PLAYABLE_STATUSES`. Las dos tabs ahora reusan esa
misma constante y siguen siendo una partición exacta.

**`slot_taken`: el mensaje específico no se veía nunca.** La causa real del redirect es que el slot
dejó de estar libre, así que el guard de disponibilidad se dispara siempre primero. Se resuelve en
ese guard y no sacándolo: ese camino ya trae el CTA "Elegir otro turno", que el banner suelto no
tiene.

**Overflow horizontal del Dashboard en 390px.** La fila del header del checklist no wrapeaba y el
botón "Descartar" terminaba 11px afuera del viewport, con scroll horizontal en toda la página.
`flex-wrap` + `min-w-0` + barra de progreso angosta en mobile.

**Skip link sin destino en la home pública.** `/` no pasa por ninguno de los layouts que definen
`id="main-content"`, así que Tab + Enter no movía nada — en la página de más tráfico del sitio
(WCAG 2.4.1). Se envolvió el contenido en un `<main id="main-content">`.

**Título duplicado en `/suspended` y `/reactivar`.** Traían su propio "— TurnoGol" y el template
`%s · TurnoGol` del layout raíz lo volvía a concatenar, también en `og:title`.
`tests/unit/suspended-route.test.ts` existía pero solo miraba `robots`; se le sumó el caso del
título. (Un intento de cubrir `/reactivar` en el mismo test se descartó: importar esa page arrastra
el cliente de DB y colgaba el test 10s.)

**La Política de Privacidad describía una cookie que no existe.** Decía "la cookie de PIN gate para
zonas sensibles del panel": el sistema de PIN se eliminó con el modelo de 2 roles y el acceso lo
resuelven los guards leyendo `tenant_staff_members`. Un texto legal (Ley 25.326) que describe un
mecanismo inexistente es un problema en sí mismo. Reescrito para nombrar lo que sí existe.

**Mock de MercadoPago** (2 hallazgos): `text-white` a mano sobre `bg-primary` daba 2.59:1 en dark
(AA pide 4.5:1) → `text-primary-foreground`, el par que el design system garantiza en 7.9:1. Y el
fondo de página, que no fijaba color y heredaba `bg-background`, quedaba casi negro detrás de la
tarjeta blanca, justo lo contrario de lo que promete el comentario del propio componente.

## Verificación

```
pnpm typecheck          ✓ limpio
pnpm lint               ✓ limpio
pnpm test               → 3472/3472 (332 archivos, 1 skip + 1 todo preexistentes)
pnpm test:integration   → 949/949 (136 archivos)
pnpm test:isolation     → 166/166
pnpm test:storybook     → 1076/1076 (265 archivos)
```

## Tanda 3 — 🟢 BUG restantes

Cruce contra `AUDIT_APP_FINDINGS.md` (extraído de `origin/claude/turnogol-admin-qa-audit-8d771f`,
no vive en este worktree): de los 41 BUG, 38 ya estaban cerrados por las tandas 1+2. Quedaban 3:

- **Falta `focus-visible` en "Eliminar mi cuenta"** (`DeleteAccountForm.tsx:33`) — VIGENTE. El botón
  disparador no tenía ninguna clase `focus-visible`, a diferencia del resto de los elementos
  interactivos de la misma vista (`confirm-dialog.tsx:126,134`). Fix: agregado el mismo patrón —
  `focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

- **Ícono de teléfono sin número/link en el bloque de deuda** (`CompleteBookingDialog.tsx`) —
  VIGENTE. `{contactName && (...)}` renderizaba "📞 {nombre}" solo con el nombre cuando no había
  teléfono — el hallazgo pide que ambas condiciones sean necesarias. Fix: `{contactName &&
contactPhone && (...)}`.

- **Botón FECHA truncado en el buscador de la home, 640-1023px** (`HeroSearch.tsx`) — VIGENTE,
  reproducido y verificado con Storybook (`HeroSearch.stories.tsx` → story `Vertical`, la que
  realmente renderiza `<lg` vía `HeroMobile`, no la `Horizontal` que solo se ve en desktop).
  Diagnóstico: `date-picker.tsx` fija `pl-10 pr-8` con `cn(...)` DESPUÉS del `className` externo —
  a propósito, según su propio comentario — así que ningún caller puede angostar ese padding desde
  afuera; el `dateFieldClass` de `HeroSearch` con `pr-2` nunca tuvo efecto ahí (dead code, no
  tocado). La grilla de 3 columnas iguales (`sm:grid-cols-3`) le dejaba a Fecha/Hora ~160px de
  ancho útil dentro del `max-w-[560px]` de `HeroMobile`; con 72px fijos de padding, el texto
  ("14/03/2026", 10 caracteres) truncaba por apenas 2px (medido: `offsetWidth:86` vs
  `scrollWidth:88`, calza con la evidencia original `85 vs 88`). Fix: Localidad pasa a fila propia
  (`sm:col-span-2`, mismo patrón que ya usa el layout horizontal del mismo archivo) y Fecha+Hora
  quedan a la par abajo — de ~160px a ~245px cada uno. Verificado en Storybook con el contenedor de
  560px inyectado a mano en 640px y 900px de viewport: `truncated:false` en ambos, con margen (245px
  contra los ~162px que hacían falta).

Los 3 fixes tocan solo el archivo que citaba el hallazgo — nada del `date-picker.tsx` compartido.

```
pnpm typecheck                              ✓ limpio
pnpm lint                                   ✓ limpio
pnpm vitest run <4 unit files puntuales>    → 38/38
pnpm test:storybook (2 archivos puntuales)  → 10/10
```

Quedan los 19 MEJORA-UX.

## Tanda 4 — los 19 MEJORA-UX

18 de 19 aplicados (el 19no, el menú mobile de marketing, se resolvió aparte más abajo tras la
pregunta al dueño); 1 NO REPRODUCE. Todos con ancla verificada contra el código (no contra el
report). Un hallazgo por vez, `pnpm typecheck && pnpm lint` en verde entre cada uno.

### P0

- **Cancelar no vivía en el panel de la Grilla** (`BookingSlotPanel.tsx`) — VIGENTE, era el más
  caro de los 19. En vez de reconstruir el flujo, se REUSA el mismo patrón que `QuickActions.tsx`
  (motivo + quién cancela + preview de reembolso) directo en el panel: nuevo campo opcional
  `cancelBookingAction` en `SlotPanelActions` (`slot-panel/actions.ts`), botón "Cancelar reserva"
  en `SlotActionButtons.tsx` (mismo criterio que `QuickActions`: solo turnos `confirmed`, no
  `pending_payment` — ahí expira solo por el hold de 6 min), diálogo nuevo en
  `BookingSlotPanel.tsx` con el mismo RadioChipGroup complejo/jugador, y wiring real de
  `cancelBookingAction` (ya exportado de `reservas/actions.ts`, solo faltaba importarlo) en
  `grilla/page.tsx`. Sin `startsAt`/`cancellationPolicyHours` en `GridBooking` — el preview de
  reembolso cae al mensaje genérico, mismo fallback que ya usa `QuickActions` cuando esos datos
  faltan, no un caso nuevo.
- **`/verify` mostraba "¡Cuenta confirmada!" en un re-login** — VIGENTE. `playerSuccessIntent()`
  solo miraba el `next` (¿es una ruta de reserva?), nunca si el jugador YA existía.
  `getOrCreatePlayer` ahora devuelve `{id, wasCreated}` (`player.service.ts`); el callback
  (`api/auth/callback/route.ts`) pasa `player.wasCreated` a `playerSuccessIntent(next, isNewPlayer)`,
  que agrega un 3er valor `booking_returning` (mismo subtítulo/CTA que `booking` — sigue siendo
  cierto que vuelve a terminar su reserva — pero título "¡Listo!", no de alta). `SuccessIntent`
  extendido en `auth-success.ts`, copy nueva en `verify/page.tsx`.
- **Foco no se movía al error tras login fallido** (`LoginCard.tsx`) — VIGENTE. `useEffect` (no
  setState, así que no pisa `react-hooks/set-state-in-effect`) enfoca el `<p role="alert">`
  (`tabIndex={-1}` + `ref`) en cada submit fallido, `[state, isError]` como deps para re-enfocar
  aunque el mensaje sea idéntico al anterior.
- **Inputs Nombre/Apellido sin `maxlength`** (`LoginGate.tsx`, checkout) — VIGENTE.
  `maxLength={80}`, mismo tope que el schema (`reservar/actions.ts:43-44`).
- **Banners de error sin CTA de recuperación** (`CheckoutStates.tsx`) — VIGENTE en los 4 códigos
  (`banned`/`too_many_holds`/`rate_limited`/`unavailable`, no solo los 3 que citaba el hallazgo:
  mismo componente, misma clase). `CheckoutErrorBanner` ahora pide `slug` (prop nueva, se
  propaga desde `page.tsx`) y cada rama agrega el link "Elegir otro turno" — mismo href que ya
  usa `CheckoutInvalidState`.

### P1

- **Input "Otro" del % de seña no sincronizaba con el chip activo** (`ReservasPolicyForm.tsx`) —
  VIGENTE, con plata real de por medio (bajaba la seña en silencio). El `onClick` de "Otro"
  precarga `customPercentage`/`customHours` con el valor del preset activo ANTES de cambiar de
  modo — mismo bug y mismo fix en el bloque de "Anticipación para cancelar" (misma clase, mismo
  archivo). Candado de regresión con datos reales: `OtroPrecargaElPresetActivo` en
  `ReservasPolicyForm.stories.tsx` (falla sin el fix, confirmado).
- **Nombre de contacto sin cuenta truncado ilegible en mobile** (`JugadoresView.tsx`) — VIGENTE.
  El badge "Sin cuenta" compartía línea con el nombre y no cedía ancho. `flex-wrap` en el `<p>`
  contenedor: el badge larga a su propia línea cuando no entra, en vez de angostar el nombre;
  `title={c.name}` como salida en desktop. Verificado con geometría real en Storybook/Chromium
  (390px): `sameLine:false` tras el fix.
- **Badge largo truncaba nombre de cancha/complejo en Mis reservas mobile** (`MisReservasView.tsx`)
  — VIGENTE, misma clase que el anterior. `flex-wrap` en el header de la card. Candado
  `BadgeLargoNoAngostaElNombre` en `MisReservasView.stories.tsx`, con contenedor de 375px inyectado
  a mano (el parámetro `viewport` de Storybook NO angosta el browser real del test runner —
  confirmado empíricamente, primer intento dio falso rojo con `gap:0`). Revertido el fix a mano y
  confirmado que el candado SÍ rompe sin él, antes de restaurarlo.
- **Gate "turno no terminó" no se anticipaba en 2 de 3 botones** (`BookingActions.tsx`, detalle de
  reserva) — VIGENTE. "Marcar completada"/"Marcar ausente" abrían el diálogo entero sin aviso;
  "Cancelar" ya usaba `turnoEnded` para su propio preview. Se sube ese cálculo (antes recalculado
  adentro del bloque de refund) y se deshabilitan los otros dos botones con `title="El turno
todavía no terminó"` — mismo criterio que ya aplican `chargeMode`/`canMarkNoShow` en el panel de
  la grilla. 2 stories (`MarcarCompletadaAbreElDialogoDeCobro`, `MarcarAusenteConfirmado`)
  necesitaron `endsAt` en el pasado (antes usaban el default de hoy 20:00 sin haber terminado, que
  ahora los dejaría deshabilitados) — no es debilitar el test, es que la premisa de esas 2 stories
  (turno ya jugado) ahora es explícita en vez de accidental. `Confirmada` reforzada para verificar
  el estado disabled + title.
- **Header muestra brevemente estado anónimo en ruta exclusiva de jugador** (Mis reservas) —
  VIGENTE, causa raíz distinta a la sospechada: `getPortalSession()`/`getPlayerHeaderInfo()` ya
  existían, cacheados por request, con el comentario explícito "para que PortalShell y
  PortalHeader compartan una sola query" — pero `PortalShell` nunca las llamaba. `(player)/layout.tsx`
  YA confirma `user.type === 'player'` antes de renderizar (si no, redirige) — ahí mismo se llama
  `getPortalSession()` (reusa el `extractAuthUser()` cacheado, sin lectura de auth extra) y se
  siembra como `initialSession` (prop nueva, opcional) en `PortalShell` → `PortalSessionProvider`.
  Las rutas públicas (`(public)/layout.tsx`) no pasan la prop — siguen anónimas-primero a propósito
  (ISR). `favoriteTenantIds` queda igual (hidrata client-side): no es lo que este hallazgo señala.
- **Botón "Elegir fecha" sin la fecha en su nombre accesible** (`AvailabilityGrid.tsx`) — VIGENTE
  (WCAG 2.5.3). `aria-label` dinámico con la fecha visible. Test unitario ajustado a un matcher
  por regex (el nombre accesible ya no es la constante `'Elegir fecha'`).
- **"Crear el primero" visible para el manager, dead-end silencioso** (`torneos/page.tsx`) —
  VIGENTE: el botón del header YA estaba bien condicionado por rol, el de la EmptyState no. Mismo
  patrón "candado, no desaparición" que ya usa `CorteZonasCard.tsx` del mismo módulo: para el
  manager es un `<span>` (no un link) con `Lock` + `title="Solo el dueño puede crear torneos"` +
  sufijo `sr-only`.

### P2

- **Dos mecanismos de error en Perfil** (`ProfileForm.tsx`) — VIGENTE. `noValidate` en el form:
  Nombre/Apellido vacíos ya no los bloquea el tooltip nativo del navegador (que nunca llegaba a
  la Server Action) — TODO error pasa por el mismo `role="alert"` de Zod (`.trim()` +
  `.min(1, 'Nombre requerido')`, ya vigente desde la tanda 2). `required` se deja (sigue marcando
  `aria-required`). Candado `NombreVacioPasaPorElMismoMecanismoDeError`: limpia el campo, clickea
  Guardar, confirma que SÍ llegó a la action (antes ni se hubiera llamado).
- **Toggles "Recibir por email"/"Solo push" sin exponer estado a ARIA** (`AvisosForm.tsx`) —
  VIGENTE. Eran 2 `<button>` sueltos. Se reemplazan por `RadioGroupPrimitive` de Radix
  (el mismo paquete que ya usa `RadioChip`, pero SIN heredar su estilo apilado — son los mismos
  className de siempre, solo cambia el elemento) → `radiogroup` real + `aria-checked` +
  roving tabindex gratis. Sin story previa para esta vista — se creó `AvisosForm.stories.tsx` con
  un candado que verifica `role="radiogroup"` y `aria-checked` en ambos estados.
- **Tira de tabs de Configuración sin scroll automático al tab activo en mobile**
  (`scroll-tabs.tsx`) — VIGENTE. Componente pasa a `'use client'` (antes no tenía JS propio);
  `useEffect` con `navRef.current.querySelector('[aria-current="page"]')?.scrollIntoView(...)` en
  cada cambio de `activeHref`. La story `Overflow` YA reproducía el caso exacto (tab activo = el
  último, contenedor angosto) — solo le faltaba el `play` que lo verificara; confirmado en
  Chromium real (`scrollLeft > 0` tras montar).

### P3

- **Links "Contactar a soporte"/"Volver al inicio" bajo 24px** (`/suspended`) — VIGENTE (WCAG
  2.5.8). Mismo patrón `inline-flex min-h-11 ... md:min-h-0` que ya usa `LoginCard.tsx` para
  "¿Olvidaste tu contraseña?".
- **Footer de marketing sin el fix de 44px que el componente hermano sí tiene**
  (`BusinessFooter.tsx` vs `SiteFooter.tsx`) — VIGENTE (WCAG 2.5.5). Mismo `min-h-11 ... sm:min-h-0`
  - `gap-y-0 sm:gap-y-2` que `SiteFooter.tsx` ya tenía documentado y resuelto.

### Decisión del dueño (post-cierre de la tanda)

Dos hallazgos quedaron como REQUIERE INPUT al cerrar la tanda 4; el dueño resolvió los dos:

- **Widget "Cobrado hoy" tarda hasta 60s en reflejar un cobro si te quedás en la misma pantalla**
  — **NO REPRODUCE** la distinción puntual del hallazgo ("cantina sí actualiza al instante,
  deudas no"): se verificó código de los dos flujos (`StreetMoneyChargeDialog.tsx` y
  `TicketPanel.tsx`) y AMBOS usan exactamente `router.refresh()` — ninguno navega ni dispara nada
  que `DayTotalBadge` escuche. La brecha real (hasta `REFRESH_MS`=60s de staleness) es un
  trade-off YA documentado y aceptado explícitamente en el propio código
  (`day-total-badge.tsx:33-37`, "Límite conocido y aceptado"). **Decisión: dejarlo como está** —
  cerrarlo de verdad exigiría un bus de eventos client-side transversal (cada punto que cobra:
  deudas, cantina, reservas, abonados…), desproporcionado para un 🟢 y pisa una decisión de
  diseño ya razonada. No aplicado.
- **Header de marketing ocultaba toda la nav en mobile sin menú alternativo**
  (`BusinessHeader.tsx`) — **Decisión: construirlo.** Menú hamburguesa (`DropdownMenu` de Radix,
  ya usado en el resto del repo — mismo primitivo que `RadioGroupPrimitive` usado más arriba para
  Avisos, consistente) con Funciones/Precios/Blog/Ingresar, trigger `sm:hidden` (h-11 w-11, tap
  target OK) junto al logo. `modal={false}` (mismo criterio que `HeroSearch`/`QuickActions`: es
  nav liviana, no un diálogo — con el default Radix aria-hidearía "Empezar gratis" mientras el
  menú está abierto). Verificado en Chromium real vía Storybook a 375px (no con `play` — el test
  runner de `@storybook/addon-vitest` corre a ~1280px fijo, `parameters.viewport` no lo angosta,
  mismo hallazgo ya documentado para `HeroSearch`; un trigger `sm:hidden` sería inclickeable ahí):
  `read_page` (árbol de accesibilidad) confirma el menú abre con los 4 `menuitem` y sus `href`
  correctos tras el click.

  `tests/unit/business-header.test.tsx` sigue pasando sin cambios: el contenido del
  `DropdownMenuContent` no está montado en el DOM hasta que se abre (Radix Portal), así que el
  segundo "Ingresar" (el de adentro del menú) no duplica el `getByRole('link', {name:
'Ingresar'})` que ya usaba la vista desktop.

## Verificación de la tanda 4

```
pnpm typecheck                           ✓ limpio (17 fixes, uno por vez)
pnpm lint                                ✓ limpio (17 fixes, uno por vez)
pnpm test                                → 3479/3480 (333 archivos, 1 skip + 1 todo preexistentes)
pnpm test:storybook                      → 1080/1080 (266 archivos — 6 stories más que antes)
pnpm test:integration tests/…/players.ts → 2/2 (wasCreated real contra Postgres)
```

Stories nuevas o reforzadas con candados reales (falla sin el fix, confirmado a mano en al menos
2 casos revirtiendo temporalmente): `ReservasPolicyForm`, `JugadoresView`, `MisReservasView`,
`BookingActions`, `AvisosForm` (nueva), `scroll-tabs`, `ProfileForm`, `HeroSearch` (verificado
en vivo con Storybook + Chromium real, sin story nueva — geometría confirmada por script).

## Menú mobile de marketing (post-decisión del dueño)

```
pnpm typecheck                              ✓ limpio
pnpm lint                                   ✓ limpio
pnpm test (suite completa, final)           → 3479/3480 (333 archivos, 1 skip + 1 todo preexistentes)
pnpm test:storybook (suite completa, final) → 1080/1080 (266 archivos)
```

Con esto se cierran los 60 hallazgos de `AUDIT_APP_FINDINGS.md`: 41 BUG (39 aplicados + 2
borrados con OK explícito) y 19 MEJORA-UX (18 aplicados + 1 NO REPRODUCE, dejado a propósito por
decisión del dueño).

## Juez completo (integration + isolation, post-cierre)

Faltaba correr las suites con DB real después de la tanda 3/4 (solo se había corrido el test
targeted de `players.test.ts`). Se corrieron completas contra Postgres local (`pnpm supabase:start`,
puerto 54322):

```
pnpm test:integration → 949/949 (136 archivos)
pnpm test:isolation   → 166/166 (tests/integration/isolation.test.ts)
```

Sin regresiones. Juez completo (typecheck, lint, unit, storybook, integration, isolation) verde
en su totalidad.

Sin commits: todo queda en el working tree.

## F-002 · Pool de Postgres agotado (`EMAXCONNSESSION`)

**Aplicado.** `idle_timeout: 20` / `max_lifetime: 30*60` agregados a los dos `postgres()` de
[client.ts](src/shared/db/client.ts) (`getSql`/`getWorkerSql`) — antes no tenían ninguno de los
dos, así que una conexión abierta no se soltaba nunca. Es la causa que señala el hallazgo: con
Fluid Compute manteniendo instancias calientes, cada una retenía sus `DEFAULT_POOL_MAX=3`
conexiones ociosas para siempre hasta agotar el `pool_size=15` de Supavisor.

**REQUIERE INPUT (infraestructura, fuera del repo):** las otras 3 acciones que propone el
hallazgo — subir `pool_size` de Supavisor, pasar `DATABASE_URL` a transaction mode (puerto 6543),
separar el pool del worker del de la web (rol propio) — necesitan acceso al dashboard de Supabase/
Railway que esta sesión no tiene. El código ya es compatible con transaction mode (`prepare:
false`, `SET LOCAL` dentro de transacciones explícitas, `pg_advisory_xact_lock` de scope
transacción) per el propio hallazgo, pero el cambio de URL/puerto lo aplica Lazar.

Verificación: `pnpm typecheck` ✓. No hay test que ejercite `idle_timeout`/`max_lifetime` contra un
pool real (necesitaría medir conexiones ociosas en Postgres — cambio de infra, no de lógica); el
comportamiento se confirma recién en producción, con las 3 acciones de infra ya aplicadas.

## F-022 · Analítica de producto no se guarda — re-chequeo, NO se trata como fix independiente

Por instrucción explícita: no cerrar sin volver a medir `analytics_events` en producción después
del fix de F-002. Esta sesión no tiene forma de deployar a producción ni de correr la recorrida
de 25 minutos que generó la medición original — sigue **ABIERTO, pendiente de remedición por
Lazar** tras el próximo deploy. El código de `src/shared/observability/analytics.ts` usa el mismo
pool que F-002 arregló (`getWorkerDb`, `after()`, catch silencioso con solo `logger.warn`) — si la
causa era el agotamiento del pool, el fix de F-002 la cubre de raíz; si la tabla sigue vacía tras
remedir, el paso siguiente (instrumentar con log explícito, ya sugerido en el hallazgo) recién
corresponde ENTONCES, no ahora.

## F-001 · CSP bloquea el WebSocket de Realtime en producción

**Aplicado.** [next.config.ts](next.config.ts): `connect-src` de producción pasó de
`'self' *.supabase.co *.mercadopago.com` a `'self' *.supabase.co wss://*.supabase.co
*.mercadopago.com` — un host pelado no habilita el esquema `wss:`, tal como documenta el
hallazgo. Fix de una línea, exactamente la solución propuesta.

Verificación: `pnpm typecheck` ✓, `pnpm vitest run tests/integration/security-headers.test.ts`
✓ (3/3 — no hay assert que dependa del string exacto de `connect-src`). Falta re-verificar contra
`https://turnogol.app` post-deploy (no se puede confirmar el header real sin deployar).

## F-024 · Empleado invitado sin forma de recuperar la invitación

**Aplicado, sin migración nueva.** Antes de tocar código se confirmó vigencia (paso 1 del
protocolo): la columna `staff_users.last_login_at` **ya existe** en el schema
([staff-users.ts](src/shared/db/schema/staff-users.ts):14) — se agregó en algún momento pero
**nunca se escribía** para staff (sí para `players` y `system_admins`, grep confirmó cero
`UPDATE ... staff_users ... last_login_at` en todo `src/`). El plan original del prompt asumía que
hacía falta una columna nueva (`invite_accepted_at`/`last_login_at`) en migración — la premisa no
aplicaba: el parche de una línea que el propio hallazgo describe como mitigación mínima
("mostrar 'Reenviar' también cuando `!lastLoginAt`, si existe esa columna") alcanza, sin
migración.

Cambios:

- [auth.service.ts](src/modules/auth/auth.service.ts) `provisionAndRouteStaff`: stampea
  `staff_users.last_login_at = NOW()` en cada login/aceptación de invitación (la única función que
  invocan tanto el callback de confirmación como `loginAction`, mismo patrón que
  `getOrCreatePlayer` en `player.service.ts`).
- [status-visual.tsx](<src/app/(admin)/settings/equipo/status-visual.tsx>): tercer estado de badge
  `pending` ("Invitación pendiente", tono warning) — antes solo `active`/`inactive`, un invitado
  sin aceptar mostraba el mismo check verde que un empleado activo hace meses.
- [StaffActions.tsx](<src/app/(admin)/settings/equipo/StaffActions.tsx>): "Reenviar invitación" pasa
  a ofrecerse cuando `isActive && !lastLoginAt` (invitación pendiente), ADEMÁS de cuando
  `!isActive` (desactivado) — antes la condición `!member.isActive` nunca era cierta para una
  invitación recién creada (nace en `true`), así que el ítem nunca aparecía en ese caso.
- [StaffRosterView.tsx](<src/app/(admin)/settings/equipo/StaffRosterView.tsx>): enhebra
  `lastLoginAt` desde `listStaffRoster` (que ya lo seleccionaba) hasta los dos componentes de
  arriba.
- Stories nuevas/actualizadas (`StaffActions.stories.tsx` — `InvitacionPendiente`,
  `status-visual.stories.tsx` — `EstadoInvitacionPendiente`) y tests nuevos en
  `tests/unit/staff-actions.test.tsx` (activo-ya-logueado NO ofrece reenviar; invitación
  pendiente ofrece reenviar JUNTO con cambiar rol/desactivar, no en su lugar).

Verificación: `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm vitest run tests/unit/staff-actions.test.tsx
tests/unit/staff-actions-role-menu.test.tsx` → 17/17 ✓, `pnpm test` completo → 3502/3503 (1 todo
preexistente) ✓. No se pudo re-probar contra `https://turnogol.app` (requiere invitar un empleado
real y no aceptar, como hizo el QA original) — pendiente de verificación en producción.

## F-004 · Marketplace público lista complejos de prueba

**Aplicado, con una corrección al criterio propuesto por el hallazgo.** El hallazgo sugería
"≥1 cancha online + onboarding cerrado". Antes de escribir el fix se leyó
`tests/integration/availability-search.test.ts` (test `'without tenantIds the behaviour is
unchanged (regression)'`) y confirmó que un tenant con **cero canchas online** (todas offline)
está **deliberadamente incluido** en el listado sin filtrar — es el caso
`publicTenantCardSinReservaOnline` (`src/test/fixtures/tenant.ts`): un complejo completo que
apagó sus canchas sigue queriendo aparecer listado, sin CTA de reserva. Agregar
`fromPriceCents IS NOT NULL` habría roto ese caso real y tested. Se usa **solo**
`settings.onboarding_completed = true` como condición de completitud — el wizard ya exige ≥1
cancha con precio válido para poder completarse, así que alcanza para sacar a `asdas` (0 canchas,
onboarding incompleto, confirmado en la evidencia del hallazgo) sin tocar el caso legítimo.

Cambios:

- [search.service.ts](src/modules/tenants/search.service.ts) `searchPublicTenantsImpl`: nueva
  condición `COALESCE((settings->>'onboarding_completed')::boolean, false) = true` en el WHERE
  (afecta `/explorar` + home, vía `searchPublicTenants`).
- [sitemap.service.ts](src/modules/tenants/sitemap.service.ts) `listSitemapTenants`: misma
  condición — antes era una query separada que NO reusaba el filtro de completitud de
  `search.service.ts`, solo el de `status`.

**Efecto colateral real, corregido:** `settings.onboarding_completed` vive en JSONB de aplicación
(`DEFAULT_SETTINGS`, `tenant.service.ts`), no en el DEFAULT de la columna a nivel DB (migr. 003) —
así que CUALQUIER tenant insertado por SQL crudo sin especificar `settings` (como hacen varios
helpers/tests de integración) queda con la key ausente → invisible con el nuevo filtro. Grep
sistemático de la clase (`INSERT INTO tenants` en todo `tests/`+`scripts/`) encontró y corrigió:
`tests/helpers/tenant.ts` (`createTestTenant`, usado en 108 archivos — ahora mergea
`onboarding_completed: true` sobre el DEFAULT de la columna, sin duplicar el resto del JSON),
`tests/integration/public-search.test.ts`, `tests/integration/search-upgrade.test.ts` (+ fix al
test `#5 onlineOnly` que pisaba `settings` entero con `{}`), `tests/integration/
availability-search.test.ts`, `tests/integration/sitemap-route.test.ts`, y
`scripts/audit/seed-d3-volume.sql` (script manual de carga D3, no CI). `scripts/seed-e2e.ts` /
`seed-staging.ts` / `demo/seed-demo-tenant.ts` ya seteaban la key — no necesitaron cambio.

**REQUIERE INPUT (decisión de negocio, no aplicado):** qué hacer con `asdas`, `Complejo random` y
`Complejo elite padel` — los 3 tenants de prueba YA publicados/indexados al momento del QA. Sin
herramienta de borrado de tenant, las opciones que enumera el hallazgo son (a) forzar la cadena de
estados hasta `blocked` desde super-admin, (b) agregar una columna de visibilidad explícita
(serviría también para demos futuras), o (c) borrar por SQL. Ninguna se ejecutó.

Verificación: `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm vitest run tests/unit/
public-search-route.test.ts tests/unit/public-cache-headers.test.ts` → 21/21 ✓ (mockean
`search.service` entero, no ejercitan el WHERE real). Los 3 integration tests que sí ejercitan la
query real (`public-search.test.ts`, `search-upgrade.test.ts`, `availability-search.test.ts`,
`sitemap-route.test.ts`) **no se pudieron correr**: esta sesión no tiene Docker/Supabase local
levantado (`npx supabase status` falló — "no se puede conectar al daemon de Docker"). Quedan
actualizados y listos por lectura/razonamiento estático, pero sin ejecutar — correrlos contra
Postgres local antes de mergear es el paso pendiente más importante de esta tanda.

## Verificación con contexto fresco (`sonnet-adversarial-reviewer`, post-tanda 🔴)

Veredicto: **APROBADO CON RESERVAS**. Corrió `pnpm typecheck`/`pnpm lint`/`pnpm test` completo por
sí mismo (verdes) e intentó `pnpm supabase:start` (mismo bloqueo: sin Docker en esta sesión).
Confirmó de forma independiente que `staff_users.last_login_at` ya existía y que no se tocó
ninguna migración existente. Encontró 4 cosas reales, las 4 corregidas en el momento:

1. **🟡 F-024 sin backfill.** `last_login_at` nunca se escribió para staff antes de este fix →
   el día del deploy, el 100% del staff activo actual (sin importar antigüedad) tiene la columna
   en `NULL` y se vería como "Invitación pendiente" con el botón "Reenviar invitación" visible.
   **Fix:** migración nueva
   [075_backfill_staff_last_login_at.sql](src/shared/db/migrations/075_backfill_staff_last_login_at.sql)
   — `UPDATE staff_users SET last_login_at = created_at WHERE last_login_at IS NULL` (idempotente,
   `created_at` como mejor aproximación disponible; el próximo login real corrige la fecha).
   Sincronizada a `supabase/migrations/` con `node scripts/sync-supabase-migrations.mjs`.
2. **🟡 `listPublicCities()` no tenía el filtro de completitud de F-004.** Alimenta el combobox de
   ciudad de la home y `/explorar` — un tenant de prueba (`asdas`) seguía apareciendo ahí aunque ya
   no apareciera en los resultados de búsqueda, llevando a 0 resultados si se lo elegía. **Fix:**
   mismo `COALESCE((settings->>'onboarding_completed')::boolean, false) = true` agregado en
   [search.service.ts](src/modules/tenants/search.service.ts) `listPublicCities`.
3. **🟢 Los tests nuevos de `provision-and-route-staff-identity.test.ts` no verificaban que el
   `UPDATE ... last_login_at` se ejecutara** (el router solo lanza ante query NO manejada, no
   exige que cada handler se use) — revertir la línea de `auth.service.ts` habría dejado el test
   verde igual. **Fix:** assert explícito `calls.some(c => /UPDATE staff_users SET
last_login_at/.test(c))` agregado en los 2 tests.
4. **🟢 Comentario desactualizado en `actions.ts:427-430`** (`resendInviteAction`) — describía la
   condición vieja de "Reenviar invitación" (`!member.isActive`), que F-024 cambió. **Fix:**
   comentario actualizado a la condición real (`!isActive || (isActive && !lastLoginAt)`).

Puntos que el revisor chequeó a fondo y confirmó SIN hallazgos: `idle_timeout`/`max_lifetime` de
F-002 (verificado contra el código fuente de la librería `postgres` — no corta conexiones a mitad
de transacción), el `connect-src` de dev no se tocó, el guard de auto-bloqueo de F-024 sigue
intacto, la decisión de no migrar para F-024 es correcta (columna preexistente confirmada), el
argumento de F-004 de NO exigir `fromPriceCents IS NOT NULL` es sólido, `search-upgrade.test.ts
#5` sigue ejercitando lo que decía ejercitar, y el blast radius de `INSERT INTO tenants` en tests/
scripts está completo.

Re-verificación tras aplicar los 4 fixes: `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm vitest run`
sobre los 6 archivos tocados por la ronda → 44/44 ✓, `pnpm test` completo → 3502/3503 (1 todo
preexistente) ✓.

## Cerrados y verificados (17)

F-008 (NO REPRODUCE en casi todo — el safety-net CSS de globals.css ya cubría, medido en vivo
contra turnogol.app; 1 gap real cerrado en `confirm-dialog.tsx`), F-009 (soft-404 admin —
`reservas/(list)/` + `torneos/layout.tsx` nuevo; `/jugadores/{uuid}` NO reproduce, sin loading.tsx
en su cadena, pendiente de que Lazar lo confirme en prod), F-010 (error de sobrecobro no se
limpiaba — 4 archivos: `BookingSlotPanel.tsx`, `FiadosList.tsx`, `StreetMoneyChargeDialog.tsx`,
`InscripcionesPanel.tsx`), F-011 (`formatPercent` nuevo en `lib/format.ts`, usado en
`analiticas/page.tsx` + `ReportCharts.tsx`), F-012 (dos `<h1>` en la home — el de `HeroDesktop.tsx`
pasó a `<p>`), F-013 (`telHref` nuevo en `lib/format.ts`, usado en `TenantHeader.tsx` +
`AvailabilityGrid.tsx`), F-014 (`generateMetadata` en `/[slug]/reservar/page.tsx`, `noIndex: true`),
F-015 (tap targets — 3 links en `status-banner.tsx` + logo mobile en `admin-header.tsx`), F-016
(`scripts/sentry-issues.ts` — `--detail` ya no manda `statsPeriod=90d`), F-017 (plural en
`FixturePanel.tsx`, diálogo de borrar fixture), F-018 (bug real: `tournament-standings.service.ts`
contaba goles-sin-autor mal — el `attributed` de la resta no filtraba `team_player_id IS NOT NULL`;

- plural "gol(es)" en `GoleadoresTable.tsx`), F-019 (mensaje del wizard de horarios menciona el
  checkbox + se limpia al cambiar cualquier campo, `StepSchedule.tsx`), F-020 (`MoneyInput` avisa
  cuando se descarta un signo negativo en vez de guardarlo en silencio), F-021 (label del campo
  Cliente en `AbonadoForm.tsx`, `/abonados/nuevo`).

## F-006 — CERRADO Y VERIFICADO

Las 5 imágenes YA están convertidas (ffmpeg local, `libwebp` + `libsvtav1`): `bg-hero-desktop.png`
1,99MB→64KB avif/106KB webp, `bg-hero-2.png` 832KB→96KB/131KB, `bg-how-it-works.png`
749KB→57KB/86KB, `bg-owner.png` 722KB→51KB/77KB, `hero-bg.png` 783KB→53KB/102KB. Verificadas
visualmente por lectura directa del archivo (`Read` sobre el .avif/.webp decodificado) — se ven
idénticas al PNG original. Los 5 componentes (`HeroDesktop.tsx`, `HeroMobile.tsx`,
`HowItWorks.tsx`, `OwnerBanner.tsx`, `para-complejos/page.tsx`) ya apuntan a
`image-set(avif, webp, png)` en vez del `url(png)` plano. `pnpm typecheck` ✓.

**Verificación en navegador (esta sesión):** `preview_start` del dev server local, dark mode,
navegación a `/` y `/para-complejos`. `read_network_requests` confirma `200 OK` sobre
`bg-hero-2.avif`, `bg-hero-desktop.avif`, `bg-how-it-works.avif`, `bg-owner.avif` y `hero-bg.avif`
— CERO requests a los `.png` originales en ninguna de las dos rutas. Sin errores de consola. El
`image-set()` renderiza como se esperaba.

`public/bg-hero.png` (608 KB, sin uso real fuera de fixtures de test) quedó sin tocar — candidato a
borrado, REQUIERE OK explícito de Lazar (protocolo de fixes), preguntado en el cierre de esta
tanda.

## D — `pnpm test:integration` / `test:isolation` contra Postgres real — CERRADO

Docker disponible esta sesión (`docker info` OK, `supabase_db_TurnoGol` ya corriendo). Corrida
completa: `test:isolation` 166/166 verde de punta a punta. `test:integration` completo encontró y
cerró **2 bugs reales** que la lectura de código de la sesión anterior no podía ver — exactamente
lo que esta verificación existía para atrapar:

1. **`tests/helpers/tenant.ts:83-102`** — `createTestTenant()` (soporte de F-004) usaba un
   `WITH ins AS (INSERT ... RETURNING id) UPDATE tenants ... FROM ins WHERE t.id = ins.id`: todas
   las partes de un mismo `WITH` corren contra el MISMO snapshot (regla documentada de Postgres),
   así que el `UPDATE` nunca veía la fila insertada por su hermano — 0 filas afectadas, siempre, y
   `rows[0]` quedaba `undefined` para **cualquier caller** de `createTestTenant()` (106 archivos).
   Reproducido en vivo contra el container (`docker exec supabase_db_TurnoGol psql`). Fix: dos
   statements separados (INSERT, después UPDATE por id). `search-upgrade.test.ts` (10 tests) pasó
   de 100% roto a 100% verde.
2. **`tests/integration/sitemap-route.test.ts:8-22`** (soporte de F-004) — `seed()` interpolaba un
   STRING ya-serializado (`const done = '{"onboarding_completed": true}'`) como parámetro con cast
   `${done}::jsonb`. El serializer jsonb del pool (mutado por Drizzle vía `restoreJsonSerializers`,
   ver `drizzle45-pisa-serializers-jsonb`) lo doble-codificaba: quedaba guardado como el STRING
   literal `"{\"onboarding_completed\": true}"` en vez del objeto, así que
   `settings ->> 'onboarding_completed'` daba `NULL` y los tenants -a/-b nunca aparecían en el
   sitemap. Confirmado con un script standalone contra `getSql()` real (`sql.json({...})` sí
   serializa bien; el string+cast no). Fix: `sql.json({ onboarding_completed: true })` en vez del
   string+`::jsonb`.
3. **Efecto colateral del fix #1** (no un bug nuevo, una tensión real entre dos usos): al arreglar
   `createTestTenant()`, el `onboarding_completed: true` que F-004 le pedía por defecto ahora SÍ se
   aplica — y eso rompió `mp-callback-happy-path.test.ts` (2 asserts), que necesita un tenant
   _fresco, sin onboarding_ para probar la transición false→true que dispara el callback de MP.
   Antes pasaba de pura casualidad (el bug #1 dejaba `onboarding_completed` sin setear = `false`).
   Fix: `createTestTenant()` suma un tercer override opcional, `onboardingCompleted` (default
   `true`, preserva el comportamiento ya probado en 950+ tests), y los 3 call sites de
   `mp-callback-happy-path.test.ts` piden `{ onboardingCompleted: false }` explícito.

**Verificación de los 3 fixes**: `pnpm typecheck` + `pnpm lint` verdes después de cada uno (ciclo
de a uno, no batcheados). `test:integration` completo: **952/953 verde** (952 en la 2da corrida,
tras los 3 fixes; era 950/953 con 3 hallazgos antes de tocar nada).

**El 1/953 que sigue rojo — NO es de esta tanda, NO se toca**: `schema-drift.test.ts` reporta
`players.phone_hint8: existe en la DB, ausente en Drizzle`. Grep confirma CERO rastro de
`phone_hint8` en `src/shared/db/migrations/`, `src/shared/db/schema/`, `supabase/migrations/` ni
`docs/` — es una columna generada (`GENERATED ALWAYS AS ...`) que vive SOLO en este Postgres local
(`\d players` la muestra con su índice), sin ninguna migración que la respalde. Drift de entorno
local preexistente, ajeno a todo lo tocado en esta sesión — no se inventa una migración para
taparlo (protocolo de fixes: no inventar columnas/estructura sin confirmar). Queda para que Lazar
diga qué es (¿WIP de otra sesión aplicado a mano?) antes de tocarlo.

## F-007 — CERRADO (3 apariciones citadas) — MÁS chico que se creía: la clase sigue abierta

**Componente nuevo**: `src/components/ui/segmented-control.tsx`, wrapper de
`@radix-ui/react-radio-group` (`AvisosForm.tsx` ya lo usaba directo — el precedente citado en el
propio hallazgo). `role="radiogroup"` + `role="radio"` + `aria-checked` + roving tabindex salen
gratis del primitive. Deliberadamente SIN estilo propio (`itemClassName(active)` — cada caller
mantiene su look exacto, cero rediseño no pedido): esto es un fix de accesibilidad, no de UI.

**Los 3 usos citados, reemplazados uno por uno** (typecheck + lint + tests entre cada uno):

1. `ReservasPolicyForm.tsx` — 4 grupos (Seña, % de seña, Reservas online, Cancelación). El
   `aria-label` de cada `SegmentedControl` tuvo que evitar repetir el texto de su `<Label>` vecina
   (`% de seña (presets)`, no `Porcentaje de seña`): un `aria-label` que matchea el mismo texto que
   ya usa `getByLabelText` ambigua CON el input real ("Otro"), y `getMultipleElementsFoundError`
   tiró 2 de las 7 stories abajo hasta corregirlo. Verificado:
   `tests/unit/reservas-policy-form.test.tsx` (2) + `ReservasPolicyForm.stories.tsx` (7, Storybook,
   con 1 fix de `getByRole('button', …)` → `getByRole('radio', …)` porque ESO es justo el punto del
   cambio).
2. `DepositFieldset.tsx` (modal de nueva reserva) — cambio de comportamiento DELIBERADO: antes
   reclickear el método activo lo apagaba a "Sin seña" (un toggle), ahora es un radio de verdad y
   eso no aplica (un radio no se desmarca reclickeándose — es semántica del rol, no una regresión).
   "Sin seña" sigue ahí como opción explícita a un click. Verificado:
   `tests/unit/reservas-quick-actions.test.tsx` (16) + `tests/unit/booking-form-modal.test.tsx`
   (15) + `QuickBookingForm.stories.tsx` (4, Storybook) + — el que SÍ agarró un caso real —
   `tests/unit/booking-grid.test.tsx` (28, 2 asserts con el mismo `getByRole('button', {name:
'Efectivo'})` → `'radio'`, encontrado recién en la corrida completa de `pnpm test`, no en la
   corrida scopeada).
3. `CompleteBookingDialog.tsx` (panel de cobro) — mismo patrón, labels cortos (Transf./MP)
   precalculados en vez de un ternario inline en el render. Sin story dedicada; verificado con
   `tests/unit/reservas-quick-actions.test.tsx` (16) + `tests/unit/contact-whatsapp.test.ts` (5).

**Cierre**: `pnpm test` completo → **335/336 archivos, 3504/3505 tests verdes** (1 skip + 1 todo,
preexistentes, ajenos). `pnpm typecheck` + `pnpm lint` verdes.

**El grep de la clase que pedía el propio hallazgo** ("reemplazar las apariciones sueltas, después
un grep para confirmar que no quedó ninguna") **encontró que la clase es mucho más grande que las 3
citadas**: `grep -rl "aria-pressed=\{" src/` da **22 archivos**. No son los 22 el mismo bug — la
mayoría son toggles genuinos de UN botón (`FavoriteButton.tsx`, filtros) donde `aria-pressed` es lo
correcto, no un grupo excluyente. Pero al menos uno SÍ es la misma clase, confirmado por lectura:
**`src/app/(admin)/caja/components/RegisterMovementModal.tsx`** tiene TRES grupos de opción
excluyente sin `role="radiogroup"` (Tipo de movimiento, Categoría, Método de pago —
`PAYMENT_METHOD_OPTIONS.map` igual que el panel de cobro, líneas 162-219). Esto quedó **FUERA del
plan aprobado** (3 archivos, no 4) — se reporta como hallazgo nuevo en vez de ampliar el scope de
esta tanda en silencio. Queda para una sesión de auditoría de accesibilidad aparte: clasificar los
22 archivos (¿cuántos son grupos excluyentes reales vs. toggles legítimos?) antes de tocar nada.

## Estado al cierre de esta sesión

Nada commiteado. `git status` para el estado exacto — a lo ya descripto en la sección de arriba
(tanda 🟡/🟢, ~55 archivos + 2 migraciones + 10 imágenes) se suman esta sesión:
`tests/helpers/tenant.ts`, `tests/integration/sitemap-route.test.ts`,
`tests/integration/mp-callback-happy-path.test.ts`, `tests/unit/booking-grid.test.tsx`,
`src/components/admin/PushNotificationManager.tsx`, `src/components/booking/BookingGrid.tsx`,
`src/app/(admin)/settings/reservas/ReservasPolicyForm.tsx`,
`src/app/(admin)/settings/reservas/ReservasPolicyForm.stories.tsx`,
`src/components/booking/quick-form/DepositFieldset.tsx`,
`src/app/(admin)/reservas/CompleteBookingDialog.tsx` (modificados) y
`src/components/booking/grid/GridLegendPopover.tsx` + `src/components/ui/segmented-control.tsx`
(nuevos). F-006, D, F-005 y F-007 quedan CERRADOS.

## 🔴 F-001 — La CSP bloqueaba el WebSocket de Realtime

`next.config.ts:22`. `connect-src 'self' *.supabase.co …`: un host-source pelado **no habilita el
esquema `wss:`**, así que Chrome bloqueaba el socket de Supabase Realtime y la grilla del admin
mostraba "Sin conexión. Los datos pueden no estar actualizados." de forma permanente. El comentario
del archivo afirmaba "en producción Realtime usa wss://… (ya cubierto)" — una suposición que nadie
había verificado, y el commit `f46dc596` (debounce de 1,5 s en el banner) había parcheado el síntoma.

**Confirmado contra producción viva antes de tocar nada**, no contra el report:

```
curl -sSI https://turnogol.app/grilla | grep -io "connect-src[^;]*"
connect-src 'self' *.supabase.co *.mercadopago.com
```

Fix: `wss://*.supabase.co` explícito en las DOS ramas (dev y prod) del `connectSrc`.

## 🔴 F-003 — Se podía exigir seña sin MercadoPago conectado

`src/app/(admin)/settings/reservas/actions.ts` no consultaba `mp_connected_at` en ningún momento, así
que "Requerir seña" se guardaba con un "Políticas guardadas." y el checkout público pasaba a mostrar
"Seña a pagar ahora". Sin `mpAccessToken` no hay preferencia de pago: el booking nace
`pending_payment` y **expira solo por hold**. El jugador cree que reservó y el complejo pierde
reservas sin enterarse.

Dos capas, las dos aplicadas:

- **Server Action** (el guard real): rechaza `requiresDeposit=true` cuando `tenant.mpConnectedAt` es
  null, con un mensaje que nombra dónde se conecta. El estado sale del tenant que ya trajo el guard
  **desde la DB**, nunca de un campo del form — misma regla que el resto de las actions de plata.
- **UI**: `ReservasPolicyForm` recibe `mpConnected` y deshabilita el control de Seña con un link
  directo a `/settings/facturacion`. Con MP sin conectar el toggle arranca en "Sin seña" aunque el
  tenant tenga `requires_deposit=true` guardado de antes (se pudo activar mientras el gate no existía).

**Queda pendiente de decisión** la tercera capa que propone el informe: qué hacer en el checkout
público con un tenant que HOY está en ese estado inconsistente. Degradar a "sin seña" confirma la
reserva pero le entrega al complejo un turno sin la seña que pidió; rechazar la reserva es lo que
propone el informe pero pierde al jugador. Es una decisión de negocio, no un fix — ver la sección
final.

## 🔴 F-022 — La analítica web no se guardaba: causa raíz encontrada

El informe dejó la hipótesis de que era F-002 (pool saturado) comiéndose los INSERT en silencio, y
pedía re-medir después de arreglarlo. Se midió, y **no era eso**.

Experimento contra producción (F-002 ya mergeado):

```
4 × GET https://turnogol.app/api/public/search   → 200 (visibles en los logs de Vercel, 18:23)
select count(*) from analytics_events            → 0 filas
logs de Vercel, misma ventana                    → ni un solo "analytics event no persistido"
```

`track.search` está en la ruta principal de `searchPublicTenants` (`search.service.ts:236`), o sea que
los 4 eventos se emitieron. Y `persist()` ya loguea por `stdout` cuando la escritura falla
(`logger.warn`, sin gate por entorno), así que **la ausencia de ese warn descarta la escritura como
causa**: el sink nunca se ejecutó.

La causa es la misma clase que ya se pagó con el locale de Zod
(memoria `zod-locale-global-no-alcanza-schemas`): **`instrumentation.ts` se bundlea en un layer
aparte**, así que su `import` de `breadcrumbs.ts` resolvía a OTRA instancia del módulo que la que
importan los servicios. `setAnalyticsSink()` seteaba la variable de módulo de una copia y `track.*`
leía la de la otra, que seguía en `null`. Cero filas, cero errores, cero ruido.

Fix (`src/shared/observability/breadcrumbs.ts`):

- El sink pasa a vivir en `globalThis` (`__turnogol_analytics_sink__`), que **sí** es compartido entre
  copias del módulo. A diferencia del caso de Zod —donde el canal era interno a la librería y no se
  podía tocar— acá el canal es nuestro.
- El modo de falla deja de ser invisible: si `track.*` corre server-side sin sink, sale un
  `Sentry.captureMessage` **una vez por instancia**. Es la distinción que el informe pedía entre "no
  se emitió el evento" y "se emitió y nadie lo escuchó".
- 3 tests nuevos en `tests/unit/breadcrumbs.test.ts` (entrega al sink, canal por `globalThis`, alarma
  una sola vez). El mock de `@sentry/nextjs` del archivo pasó a exportar `captureMessage`: era
  incompleto respecto al módulo real y explotaba en el primer `track.*` de la suite.

**Verificación pendiente**: la prueba definitiva es re-medir `analytics_events` después del deploy.
Hasta entonces esto es una causa raíz confirmada por descarte, no por observación del fix corriendo.

## 🟡 F-019 — El wizard rechazaba el horario nocturno sin señalar la salida

Dos de los tres puntos del hallazgo:

- `opening-hours.schema.ts`: el mensaje ahora nombra la opción que resuelve el caso ("Si cerrás después
  de medianoche, activá esa opción más abajo"), y solo cuando el flag está apagado. Se toca el schema
  compartido a propósito: el mismo mensaje sale en `/settings/horarios`, que tiene el mismo control.
- `StepSchedule.tsx`: el error del server se oculta apenas cambia cualquier valor del formulario
  (`touchedSinceError`). Antes quedaba en pantalla después de corregir, y el paso se leía como
  bloqueado cuando ya era válido — misma clase que F-010.

Sin resolver, y es de UI, no de validación: la vista previa "TU SEMANA" muestra `Lun 08:00–02:00`
mientras el formulario rechaza ese mismo horario. La pantalla se sigue contradiciendo a sí misma.

## 🟡 F-020 — NO REPRODUCE

El hallazgo dice que tipear `-500` en el precio del wizard guardaba $500 **en silencio**. La primera
mitad es cierta; la segunda no. `MoneyInput.handleChange` reescribe el display normalizado en la misma
tecla (`parsePesosToCents` descarta todo lo que no sea dígito y `centsToInputDisplay` lo vuelve a
formatear), así que el campo **nunca llega a mostrar `-500`**: muestra `500` mientras se tipea. Lo que
se ve es lo que se guarda, que es exactamente lo que pedía la solución propuesta.

Verificado, no razonado — 3 casos nuevos en `tests/unit/money-input.test.tsx` que fijan la propiedad:
el signo menos no llega al campo, la basura tipeada se descarta a la vista, y un campo con solo
caracteres inválidos queda vacío (no en cero).

## 🟡 F-021 — El campo "Cliente" de Turnos fijos no tenía etiqueta accesible

`AbonadoForm.tsx`: la `<label>` existía pero sin `htmlFor`, y el input sin `id`. Era el único de los
siete campos del formulario en esa condición. `id="contactName"` + `htmlFor`, como los otros seis.

## 🟡 F-025 — El "esperá tu email" del registro se perdía con un refresh

`useActionState` vive en memoria del navegador: un F5 en la pestaña que quedó esperando reiniciaba el
estado a `idle` y reaparecía el formulario **vacío**, como si el registro nunca hubiera pasado.

- La marca viaja en la URL (`/register?pending=1`), que el Server Component lee y pasa como prop.
- El email va en `sessionStorage`, **no** en el query string: es dato personal y en la URL se filtra a
  logs, referrers e historial. Si no está (otra pestaña, storage limpiado) sale el mismo cartel sin el
  email — peor mensaje, nunca el formulario vacío.
- Se lee con `useSyncExternalStore` y no con `useState` + efecto: el snapshot del servidor es `null`,
  así que no hay mismatch de hidratación ni el `setState` dentro de un efecto que
  `react-hooks/set-state-in-effect` prohíbe (la regla lo cazó en el primer intento).

## 🟡 F-026 — Horario default parejo para los 7 días

**Migración 077** (`077_uniform_opening_hours_default.sql` + espejo en `supabase/migrations/`). El
DEFAULT de `tenants.opening_hours` (migr. 003) traía viernes cerrando 01:00, sábado abriendo 09:00 y
domingo cerrando 23:00, sin que nadie los hubiera elegido. `sanitizeWizardHours` ya corregía el bug
TÉCNICO de ese default (madrugada sin `closes_next_day` = día sin precio en silencio) pero no la
diferencia de horario, que es el bug de producto: el complejo publica un horario que no es el suyo.

`SET DEFAULT` no toca ninguna fila existente — ningún complejo ya creado cambia de horario.

## 🟢 Los siete menores

| ID    | Qué se hizo                                                                                                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-011 | `formatPct()` nuevo en `src/lib/format.ts` (es-AR, coma decimal). Aplicado a los 2 usos de `/analiticas` y a los 2 formatters de `ReportCharts`. El `%` se concatena a mano: `style:'percent'` mete un NBSP y complica los matchers sin ganar nada |
| F-012 | Un solo `<h1>` en la home: el de `HeroDesktop` queda, el de `HeroMobile` pasa a `<p role="heading" aria-level={1}>` — suena igual en un lector de pantalla y no duplica el encabezado para el crawler                                              |
| F-013 | `telHref()` nuevo en `src/lib/contact.ts`: conserva dígitos y el `+` inicial. Aplicado en `TenantHeader` y `AvailabilityGrid`. El formato lindo sigue siendo el TEXTO del link                                                                     |
| F-014 | `generateMetadata` en `/[slug]/reservar`: título con complejo, fecha y hora; `noIndex` porque es una pantalla con parámetros de una reserva puntual                                                                                                |
| F-015 | `ctaClass()` en `status-banner.tsx`: `min-h-11` (44 px) solo en mobile para los TRES CTA del banner, no solo el reportado — "Elegir plan", "Actualizar pago" y "Reactivar" tenían el mismo problema                                                |
| F-016 | `scripts/sentry-issues.ts`: `statsPeriod=90d` → `14d` en el camino de `--detail`, que la API rechaza siempre con 400. El listado ya respetaba el límite; este camino no                                                                            |
| F-027 | Placeholder de ciudad: "Ej: Luján" → "Ej: Rosario" (el informe lo señala como probable origen de los "Lujan, Neuquén" de F-004)                                                                                                                    |

## Verificación

```
pnpm typecheck        ✓
pnpm lint             ✓
pnpm test             → 3551/3551 (337 archivos, 1 skipped, 1 todo preexistente)
pnpm test:storybook   → 1118/1118 (275 archivos)
```

Sin correr acá: integración/isolation (necesitan Postgres local levantado) y e2e. La migración 077 es
un `ALTER … SET DEFAULT` que CI aplica en orden.

## Pendiente de decisión del dueño (REQUIERE INPUT)

Los dos se resolvieron el mismo día — ver la sección siguiente. Quedaba: (1) qué hace el checkout
público con un tenant que ya está en el estado inconsistente de F-003, y (2) si se sube la foto de la
cancha en la jerarquía del wizard (F-028).
