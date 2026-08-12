# Deuda cero antes de la Fase 5 — los 8 bloques que quedan

> Reconstruido el 2026-08-11 contra `main@05341d73`. El plan original vivía en un archivo de
> plan de sesión y **se perdió** (lo sobreescribí al planificar B16). Este documento lo reemplaza
> y vive en el repo justamente para que eso no pueda volver a pasar.

## Estado

Cerrados y en `main`: **B0** (higiene) · **B1** (retención 90 días) · **B2** (reportes en día
operativo) · **B3** (stories + candado) · **B4** (analytics_events) · **B5** (knip) · **B6**
(capas `@/shared`) · **B7** (react-hooks en `error`) · **B16** (Torneos, [#126](https://github.com/Laza223/turno-gol-repo/pull/126)).

**B9 cerrado** y el **🔴 de B10** también (2026-08-11, ver `docs/audit/PROGRESS.md`): `pnpm test`
colecta `src/`, los 14 guards `dbAvailable` salieron, y el export CSV pasó a `withTenant`.

**B10 CERRADO** (2026-08-11, PRs #137/#138/#139). Tres correcciones al plan en el camino:
`with-auth.ts` **no** es código muerto (lo usa `route-wrappers-request-context.test.ts` como
implementación de referencia); el gate de `/api/e2e/create-booking` **no** dependía del inlining de
`NEXT_PUBLIC_E2E` sino de `NODE_ENV`; y `getAbonados` **no se paginó** porque su total sale de
`.length` sobre las mismas filas — no miente. Las 12 páginas con `extractAuthUser` crudo tampoco
eran un agujero (los layouts las cubren): en vez del refactor quedó
`tests/unit/app-page-guard-chain.test.ts`, que verifica la cadena entera del árbol — y encontró un
🔴 que el plan no tenía: `mock-mp/checkout/page.tsx` tenía el portón más débil que sus propias
Server Actions.

**B12 cerrado** (2026-08-11, migr. 074): ENUM `player_tag` con las 5 etiquetas sobre
`player_tenant_relationships`, ficha + chips en la lista, y `abonados.notes` **eliminada** — decisión
del dueño, verificada contra producción antes del DROP (0 filas). Destraba B13.

**B13 cerrado** (2026-08-11): `/jugadores` pasa a ser la lista ÚNICA de personas — los titulares de
turnos fijos sin cuenta se derivan de `abonados` (sin tabla nueva) y se vinculan a mano, con inverso.
Sin migración.

**B8 cerrado en lo que importaba** (2026-08-11, PRs #135/#136 + parte 2): la premisa del bloque
—"convertir 193 casts al genérico de Drizzle"— **no se sostuvo**: esa conversión no atrapa nada,
porque el genérico es la misma aserción sin chequear. Lo que sí faltaba era medir qué devuelve el
driver, y ahí aparecieron 3 filas que prometían camelCase sobre SQL crudo (campos multi-palabra
valiendo `undefined` con TypeScript en verde) y 12 campos `Date` que son string. Cero bugs vivos,
verificado consumidor por consumidor. Tabla de tipos en `src/shared/db/client.ts`, candado en
`tests/unit/raw-sql-row-shape.test.ts`. El barrido mecánico de los ~190 restantes queda sin hacer,
a propósito.

Quedan **B11 · B14 · B15**. Ninguno tiene el alcance escrito en ningún lado;
lo de abajo es la reconstrucción, medida contra el código de hoy.

## Ojo con la nomenclatura: hay TRES series que se llaman igual

Esto ya me hizo mapear mal dos bloques. Las tres conviven:

| Serie | Dónde vive | Ejemplo |
|---|---|---|
| **Bloques B0–B16** de este esfuerzo | solo en `docs/audit/PROGRESS.md` (secciones `## B5`, `## B6`, `## B7`, `## B16`) y en el `git log` | B16 = Torneos |
| **Auditoría de datos D1–D8** | `docs/audit/STATE.md`, `MASTER_PLAN.md` | D1 = schema e índices |
| **Decisiones de fase v2 D1–D8** | `docs/planning/2026-08-01-decisiones-de-fase-v2.md` | D1 = política del hold |

Y `docs/audit/STATE.md:52-53` usa `B10`/`B11` para **la auditoría vieja de mayo** (Observabilidad /
Operativo), que no tiene nada que ver con los bloques de acá.

Mapeo correcto de los que citan una "D": **B11 → auditoría D6** · **B12 → decisión v2 D3** ·
**B14 → visión §3.3 (se relaciona con decisión v2 D5)** · **B15 → decisión v2 D1**.

---

## B8 — Tipos de SQL crudo ✅ CERRADO en lo que importaba (2026-08-11, PRs #135/#136 + parte 2)

Lo de abajo es el plan original, con lo que **medirlo refutó** marcado. Ver
`docs/audit/PROGRESS.md` § "B8 (parte 2)".

**193 casts a mano** del resultado de un SQL crudo, en **55 archivos** (hoy 205; el número crece
con cada feature). La forma es siempre `(rows as unknown as Array<{…}>)`.

> **La premisa central del bloque no se sostuvo.** El plan asume que convertir esos casts al
> genérico de Drizzle (`tx.execute<T>(sql\`…\`)`) es el trabajo. **Esa conversión no atrapa ni un
> bug**: el genérico es la MISMA aserción sin chequear, escrita más corto. Lo que atrapa algo es
> comparar la forma prometida contra lo que el driver devuelve — y eso nadie lo había medido.
>
> Medido: **las dos APIs del repo parsean distinto el mismo SQL**. Por `tx.execute` un
> `timestamptz` llega **string**; por el template de postgres-js llega **Date**. Y el SQL crudo
> devuelve claves **snake_case**, mientras `$inferSelect` es camelCase. Tabla completa escrita en
> `src/shared/db/client.ts`.
>
> Encontrado con esa tabla en la mano: **3 sitios** que prometían camelCase sobre SQL crudo
> (`autoCompleteOverdueBookings` y los dos ramos de `createCashFlow` con idempotency key) y **12
> campos** declarados `Date` que son string. **Cero bugs vivos** — verificado consumidor por
> consumidor: todos leen `.id`/`.length` o envuelven en `new Date()`. El sistema andaba por
> casualidad. Candado nuevo: `tests/unit/raw-sql-row-shape.test.ts`.

**Las tres "de mayor riesgo" del plan, verificadas una por una:**

- `payment.service.ts:968` — `Array<{ total: string | number }>` sobre reembolsos previos.
  **REFUTADA en la parte 1 (#135)**: la concatenación no existía.
- `cashflow.service.ts:139,148` — `typeof cashFlows.$inferSelect` sobre un `RETURNING`.
  **CONFIRMADA, y peor de lo escrito**: no es "fila completa desde un RETURNING parcial", es
  camelCase sobre claves snake_case. Arreglada en la parte 2.
- `billing.service.ts:469` y `super-admin/support.service.ts:356` — `!` encima del conteo de
  canchas que decide límites de plan. **REFUTADA**: los dos usan `COUNT(*)::int` (que sí llega
  como number) y un `COUNT` sin `GROUP BY` devuelve siempre exactamente una fila, así que el `!`
  es correcto.

**El corte en 3 PRs (torneos / caminos de plata / resto) queda SIN hacer, a propósito.** Es churn
mecánico sin defecto detrás, y el candado nuevo ya lee las dos formas (`as unknown as` y
`.execute<…>`), así que no lo necesita para funcionar. Si algún día se hace, es por consistencia
de estilo, no por seguridad — y conviene decirlo así en el PR.

### B8d — Prettier

Está configurado (`.prettierrc`, Prettier 3.9.5) y **no corre en CI**, confesado por escrito en
`ci.yml:40-45`. Medido hoy: `prettier --check .` reporta **1748 archivos**; `pnpm format:check`
(que solo cubre `src/`) reporta **761**. El comentario de CI decía ~716 — la deriva crece porque
nada la frena.

Dos cosas antes de enchufar el gate: **no existe `.prettierignore`** (con `.` alcanza
`e2e-results/`, `visual-results/`, `semgrep-sarif/` — ~45 archivos generados), y el scope de
`format` (`src/`) está desalineado con el de `lint` (`src/ tests/ scripts/`).

---

## B9 — Tests debilitados ✅ CERRADO (2026-08-11)

Los dos hallazgos de abajo están arreglados. Lo que sigue vivo del bloque es el párrafo final
("El resto, para dimensionar"): los `test.fixme`/`test.skip` de Playwright, el `retries: 2`, el
`color-contrast` desactivado en las suites de axe e2e y los 388 `toBeTruthy()` **no se tocaron**.

Dos hallazgos que no son "test flojo" sino **cero señal**, y que valen más que todo el resto junto:

1. **~28 tests reales en `src/` que nunca se ejecutan.** `pnpm test` es `vitest run --dir tests/unit`
   y `test:integration` es `--dir tests/integration`: **ninguno colecta `src/`**. Verificado con
   `vitest list --filesOnly` (0 archivos bajo `src/`). Los 4 archivos huérfanos:
   `src/app/(admin)/settings/equipo/actions.test.ts` (**~10 tests de guards de autorización de
   staff** — superficie de seguridad), `src/modules/home/home.lib.test.ts`,
   `src/modules/reports/report.utils.test.ts`, `src/app/(admin)/dashboard/queries.test.ts`.
2. **14 guards `if (!dbAvailable) { console.warn(…); return }`** en 6 archivos de integración, y en
   los 6 el guard cubre el **100%** de los tests del archivo (`daily-summary-worker`,
   `push-subscribe-rls`, `push-send-idempotency`, `push-test-endpoint`,
   `push-dispatch-on-booking-confirmed`, `push-worker-410-cleanup`). Sin DB reportan verde perfecto,
   y como no usan `it.skip` ni siquiera figuran como skipped.

El resto, para dimensionar: vitest tiene **0** `it.skip`/`describe.skip`/`it.todo` (limpio).
Playwright tiene 4 `test.fixme` + 3 `test.skip`, de los cuales el peor es
`admin-mobile-smoke.spec.ts:299` (`test.skip` en el `else` de un `if`: si la UI cambia, **se
auto-saltea y pinta verde** en vez de fallar). `playwright.config.ts:13` tiene `retries: 2` en CI
(ya fichado como "enmascara flakiness" en un plan de mayo). Las 3 suites de axe e2e desactivan
`color-contrast` — por eso las stories son el único lugar del repo que mide contraste. 388
`toBeTruthy()` (el número de tests *débiles* de verdad es menor, no se puede separar
automáticamente "única aserción" de "una de varias"). 2 `continue-on-error` (semgrep, rotulado
ADVISORY). Un comentario stale en `cancellations.test.ts:1318` que dice "quitar `.skip` cuando se
aplique el fix" cuando el `.skip` ya no está.

---

## B10 — Route-guard + paginación ✅ CERRADO (2026-08-11, PRs #137/#138/#139)

### Guards

34 route handlers: 11 `withTenant`/`withBillingTenant` · 4 `withPlayer` · 5 guard manual · 14 sin
guard (la mayoría públicos por diseño, con rate-limit en `middleware.ts`). Las 41 páginas de los
route groups están todas cubiertas por sus layouts.

Lo que sí está mal:

- ✅ **CERRADO (2026-08-11)** — 🔴 **`api/reports/revenue/route.ts:17`** — exportaba a CSV **todos**
  los `cash_flows` del tenant en un rango arbitrario, y validaba solo `user.type === 'staff'` +
  `getStaffTenant`. **No revalidaba el rol** contra `tenant_staff_members` y **no chequeaba el
  lifecycle del tenant**: un tenant `blocked`/`suspended`/`churned` seguía exportando, cuando el
  layout `(admin)` los tiene hard-lockeados. Pasó a `withTenant` (default admin+manager), con
  `reports-revenue-route-guard.test.ts` y control negativo corrido.
- 🟡 **`api/status/route.ts:185`** — sin auth, devuelve estado de `db`, `workerPool`, `pgboss`,
  `upstash`, `encryptionKey`, `storage` + `checkConfigured()`. Info disclosure.
- 🟡 **`api/e2e/create-booking/route.ts:23`** — sin auth; gate por `NEXT_PUBLIC_E2E === '1'`, que se
  inlinea en build. El `playerId` sale de un header sin verificar.
- 12 páginas usan `extractAuthUser` + `getStaffTenant` crudos sin leer `getStaffRole`. Hoy no es un
  agujero (son pantallas operator-level donde admin y manager pasan igual) pero rompe el patrón
  bueno de `jugadores/page.tsx:14`, que sí usa `requireOperatorStaff()`.
- `src/server/middleware/with-auth.ts` es **código muerto**: 0 consumidores.

### Paginación

7 listados problemáticos. El peor es **`getStreetMoney`** (`street-money.service.ts:86`): sin
`LIMIT`, compone 3 subqueries también sin límite, la deuda impaga **se acumula para siempre**, y se
recalcula entera en cada carga de `/caja` (no solo en `/caja/deudas`).

Los otros sin techo: `getCashFlowsForExport` (rango elegido por el usuario, todo a memoria),
`getAbonados` (`SELECT *`, y el total se calcula con `.length`), `getCashFlows` (acotado a 1 día,
bajo riesgo). Con `LIMIT 200` sin cursor, o sea **truncan en silencio**: `listTenantBookings`
(y peor: las píldoras salen de un `count` sin límite, así que la UI puede decir "Completadas (740)"
y listar 200), `listTenantPlayers`, `/mis-reservas`.

`audit_logs`, `notifications` y `analytics_events` **no necesitan trabajo** (el primero ya pagina
bien en super-admin; los otros dos no tienen UI de lectura). Patrón a copiar:
`api/bookings/route.ts:12-77`, cursor real — aunque su único consumidor pide `?limit=200` y nunca
sigue el cursor.

---

## B11 — Load testing (auditoría D6)

Lo que pedía D6 (`MASTER_PLAN.md:300-305`): medir de verdad el p95 <500ms de `doc5`, con k6, sobre
el seed de D3, en los 2 endpoints calientes (disponibilidad pública y webhook MP), con carga de
viernes 18-22hs.

**Herramientas de load testing en el repo: cero.** Ni k6, ni artillery, ni autocannon. Lo único
parecido es `pnpm stress:bookings` (`scripts/stress-test.ts`), que **no es un load test**: dispara
50 reservas paralelas al mismo slot y verifica que solo una entre. No mide latencias ni percentiles.

`doc5_rnf.md:54-64` declara 6 presupuestos, no uno solo (grilla 500/800ms, reserva admin
1500/2500, reserva online 2000/3500, dashboard 800/1500, búsqueda 600/1000, reportes 2000/4000), y
dice cómo medirlos. **Nada de eso se mide.** Los únicos 2 hits de "p95" en `src/` son comentarios
que *citan* el requisito para justificar un timeout.

Lo que sí está resuelto: el seed. `scripts/audit/seed-d3-volume.sql` es reusable tal cual (15.695
bookings, 22.431 cash_flows, 25.000 audit_logs, 200 tenants de fondo, `setseed` fijo, idempotente),
más el harness `explain-d3-hotpaths.sql`. **El alcance real de B11 es: escribir el script k6,
correrlo, y producir el report que falta.**

---

## B12 — Etiquetas de cliente (decisión v2 D3) ✅ CERRADO (2026-08-11, migr. 074)

> Implementado tal cual lo de abajo: ENUM `player_tag` cerrado sobre
> `player_tenant_relationships`, columna array `tags` (no tabla hija — `audit_logs` ya da la
> trazabilidad con `player.tags_updated`), CHECK de unicidad en la base vía función `IMMUTABLE`, y
> `gets_credit` + `no_credit` rechazadas juntas en el borde. **`abonados.notes` se ELIMINÓ** — la
> pregunta abierta del último párrafo la respondió el dueño el 2026-08-11, con 0 filas en producción
> verificadas antes del DROP.

**En el schema no existe nada**: 0 columnas de etiquetas sobre personas. El lugar natural es
`player_tenant_relationships` (ya es la tabla por tenant+jugador, con `noshowCount`,
`lastNoShowAt`, `status`, `dataConsentAt`). `players` no sirve: es global, cross-tenant, y la
etiqueta es del complejo.

La decisión (`decisiones-de-fase-v2.md:41-45`): **solo etiquetas de un set predefinido, sin texto
libre sobre personas**. El motivo es legal, no de UI — lo que un cliente puede leer ejerciendo
derecho de acceso (Ley 25.326) queda controlado en origen: *"nunca aparece un 'chanta, no atenderle
el teléfono' escrito a las 2 AM"*.

**El set final ya está cerrado** (`2026-08-07-analisis-rubro-y-decisiones.md:129-166`, sección
titulada literalmente *"El set de etiquetas D3 (destraba B12 → B13)"*): `Se le fía` · `No fiar` ·
`Organiza el grupo` · `Tiene precio acordado` · `Trato conflictivo`. Descartadas *VIP* (categoría
sin consecuencia = decoración que igual es dato personal) y *Paga tarde* (el sistema ya lo mide con
deuda real). La regla que lo gobierna: **una etiqueta solo se justifica si captura algo que el
sistema no puede medir solo**.

Nota de implementación ya decidida: es un **`ENUM player_tag` cerrado**, no una tabla de
configuración por complejo — un set abierto reintroduce el problema legal. Si aparece 2+ veces una
necesidad no cubierta, se agrega una sexta al ENUM (aditivo). Si aparece la necesidad de texto
libre, **no se concede**: se reabre D3 con el dueño.

Pendiente de decidir: qué pasa con `abonados.notes` (`schema/abonados.ts:47`), texto libre asociado
a una persona con nombre y teléfono. **Es exactamente lo que D3 prohíbe** y hoy existe.

---

## B13 — Merge de Clientes ✅ CERRADO (2026-08-11)

> Implementado derivando la persona sin cuenta de `abonados` en vez de darle tabla propia, con
> agrupación por los últimos 10 dígitos del teléfono (estricta, porque fusiona sin confirmación) y
> sugerencia por los últimos 8 (laxa, porque la confirma un humano). `linkContactToPlayer` /
> `unlinkContactFromPlayer` + guard de pertenencia al tenant, con control negativo corrido.
> Detalle y evidencia en `docs/audit/PROGRESS.md`.

Sí: unificar `/jugadores` + `/abonados` en **una** lista de personas. Lo dice el propio código —
`src/app/(admin)/jugadores/ClientesTabs.tsx:13-16`:

> *"OJO — esto es la CÁSCARA de navegación, no la fusión de Clientes: por dentro siguen siendo dos
> listas de personas distintas."*

El solape concreto: `/jugadores` sale de `player_tenant_relationships ⋈ players` (**solo perfiles
registrados**, por decisión de producto), mientras `/abonados` sale de `abonados`, donde
`playerId` es **nullable** y `contactName`/`contactPhone` son NOT NULL. O sea: un abonado con
`player_id = NULL` **es una persona que existe solo como nombre+teléfono y que `/jugadores` nunca
muestra**. Es literalmente el caso que el pase crítico anticipó: *"el 'Diego' del fijo de los
lunes, que quizás no tiene cuenta — o peor, quizás ES el 'Diego R.' que reserva online"*.

La política ya está decidida (`decisiones-de-fase-v2.md:12`): **ficha ligera para no registrados +
vinculación manual por el staff, nunca merge automático**. Criterio de salida de Fase 4: *"UNA lista
de personas; fijos como pestaña; ficha-panel abrible desde Grilla, Caja y deudas sin navegar"*.

Orden explícito en los docs: **B12 destraba B13**. Primero el ENUM y la ficha, después la fusión
encima de esa ficha.

⏳ **Este bloque tiene ventana que se cierra.** El pase crítico
(`2026-08-01-vision-v2-pase-critico.md:5`) dice que Fase 4 *"es la cirugía más barata de hacer sin
clientes y la más cara de hacer con ellos… la ventana expira con el primer contrato"*.

---

## B14 — "Hoy: $X" en el sidebar

Origen (única mención literal en el repo, `vision-producto-turnogol-v2.md:157`): *"el número de
'Hoy: $X' acompaña en la barra, visible desde cualquier espacio (P2)"*. Es un pedido de
**navegación** para el admin (no volver a `/dashboard` cada vez), no una compensación para el
manager — aunque de paso también le sirve, y es compatible con la regla de roles (*el manager ve
toda la plata del día que opera, nada de la plata del negocio*).

La función ya existe: **`getDaySummary`** (`cashflow.service.ts:259`) devuelve `balance`,
`totalIncome`, `totalAdjustments`, `byMethod`, `isClosed` — todo en centavos, una sola query
agregada, y **respeta el día operativo del tenant**. Único caller hoy: `/caja`, que además ya
calcula `ingresos = totalIncome + totalAdjustments`.

Bloqueante estructural: `AdminSidebar` es `'use client'` y recibe todo por props desde
`(admin)/layout.tsx`, que **hoy no consulta un solo peso**. El número tiene que entrar por ahí o
por un endpoint.

Riesgo a vigilar: el criterio de salida de Fase 1 exige *"fuente única de agregados: el mismo
número en toda superficie que lo muestre… verificado con test de consistencia, no a ojo"*. Un
"Hoy: $X" en el sidebar es una segunda superficie del mismo número que ya muestran `/caja` y
`/dashboard`.

---

## B15 — Visibilidad del hold (decisión v2 D1)

**Es el criterio de entrada a la Fase 5** — pero ver la advertencia de secuencia más abajo.

Un hold = una fila de `bookings` en `status='pending_payment'`. **TTL 6 minutos**
(`DEFAULT_EXPIRY_SECONDS`). Nace solo en el flujo online con seña; sin seña la reserva se crea
`confirmed` directo.

**Dos de los tres entregables del gate ya están cumplidos**, y la propia decisión lo dice
("formaliza y hace **visible** una mecánica de expiración que el sistema ya tiene"):

| Ítem del gate | Estado |
|---|---|
| El hold nace al iniciar el pago | ✅ ya cumple — el INSERT ocurre al hacer submit, mirar el slot no escribe nada |
| Liberación automática | ✅ ya cumple, y robusta: job por-booking + barrido de respaldo + precheck contra MP antes de expirar + tope de 3 holds simultáneos por jugador |
| Countdown visible al jugador | 🟡 existe, pero **solo después de volver de MercadoPago** |
| "Pagando ahora" en la grilla del staff | 🔴 dice "Esperando seña", sin tiempo restante |
| El hold ajeno, legible por otro jugador | 🔴 **no existe el concepto** |
| Copy "la cancha es tuya cuando empezás a señar" | 🔴 ausente |

🔴 **El agujero más caro: un slot con hold de otro jugador se ve idéntico a uno vendido.** El tipo
ni siquiera tiene el estado: `SlotStatus = 'free' | 'occupied' | 'fixed' | 'blocked' | 'past'`
(`public.service.ts:58`), y un `pending_payment` cae en el `else` final → `'occupied'`. Mismo
tratamiento en las otras dos superficies de disponibilidad
(`availability-search.service.ts:212,369` — el buscador cross-tenant de `/explorar` — y
`booking.service.ts:972` — `getAvailableSlots`).

Viernes 20:30: el jugador B ve la cancha "ocupada" y se va a otro complejo. Seis minutos después
el hold de A expira y el slot vuelve a estar libre, pero B ya no está. **Es inventario que se pierde
por una pantalla que no dice la verdad** — exactamente lo contrario de lo que D1 quiere ("la
ansiedad se responde con estados explícitos, no con inventario congelado").

Bloqueante técnico para el lado del staff: la query de la grilla **no trae `bookings.created_at`**
(`grilla/page.tsx:56-71` selecciona 15 columnas y no está), así que hoy la grilla no tiene el dato
para calcular el tiempo restante aunque quisiera.

Cicatriz que prueba que esto ya mordió (`reserva/[bookingId]/pendiente/page.tsx:41-43`): *"el hold
real vence a los 6 min, no a los 15 que este contador mostraba antes — el jugador confiaba en un
margen que ya no existía y perdía el slot sin darse cuenta"*.

---

## Advertencia de secuencia: la Fase 5 NO se destraba con B15

`2026-08-01-vision-v2-pase-critico.md:140` fija **dos** condiciones de entrada:

> **Fase 5 — El flujo jugador.** Espera dos cosas: la decisión del hold (§3.1) **y que exista al
> menos un complejo real compartiendo su link** — antes de eso no hay embudo que optimizar ni datos
> para validarlo.

Y el mismo documento es explícito: *"el flujo jugador baja al final. Sin tráfico online real,
optimizar conversión es pulir una puerta por la que no pasa nadie"*. En "qué NO hacer primero"
lista *"cualquier optimización del embudo jugador anterior al primer complejo con tráfico real"*.

Al 2026-08-01 **no había ningún cliente real** — todos los tenants de prod eran pruebas del propio
dueño. El registro es público desde el 2026-07-30, así que esto hay que **re-verificar**, no
asumir.

**Consecuencia para la prioridad:** terminar B15 no destraba la Fase 5 por sí solo; la otra
condición es comercial. Lo que sí se sostiene solo es el pedazo de B15 que arregla el hold ajeno
invisible — eso no es optimización de embudo, es un bug que quema inventario en cuanto haya
tráfico.

## Y lo que tiene ventana de verdad

Fase 4 (**B12 + B13**) es *"la cirugía más barata de hacer sin clientes y la más cara de hacer con
ellos"*, y la ventana **expira con el primer contrato**. Es el único grupo de este backlog cuyo
costo sube con el tiempo.

## Fuera de los bloques, abierto y con plata de por medio

De `docs/audit/STATE.md` y del go-live:

- **Upgrade self-service devuelve 501** (falta la fila `saas_upgrade` en `feature_flags`): un
  complejo **no puede pagarte solo**. Abierto desde ~2026-08-01.
- `notification_url` ausente en `createPreapproval`.
- El trial pasa a `blocked` directo y sin aviso (`expire-trials.worker.ts`); los templates
  `trial_welcome`/`trial_ending` existen pero ningún `enqueueNotification` los referencia.
  Recordatorio manual ~28/08.
- 4 REQUIERE INPUT de la auditoría D4 (report §9), incl. `updateProduct` pisa stock cacheado y la
  condición temporal de no-show (doc6 dice `time_end`, el código exige `time_start`).
- 🔴 **IVA**: `doc4` dice "precios sin IVA, +21% en el checkout" y el código no lo implementa.
  Cambia el signo de la comparación con ATC. Decisión fiscal del dueño.
