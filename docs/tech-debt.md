# Deuda técnica — TurnoGol

Ledger de deuda registrada (`código anda pero el costo de mantenerlo crece`), no backlog de features.
Formato por entrada: qué / por qué existe / costo de no resolver / costo de resolver / disparador.
Revisar en cada retrospectiva del esfuerzo relacionado — ver skill `deuda-tecnica`.

---

## `searchPaymentsByReference` sin paginación

**Qué es**: [mp-gateway.implementation.ts:204-214](src/modules/payments/mp-gateway.implementation.ts:204-214) llama `new Payment(this.config).search(...)` sin `limit`/`offset`. `PaymentSearchOptions` (SDK `mercadopago@2.13.0`, `search/types.d.ts:174`) soporta paginación y la respuesta trae `paging: {total, limit, offset}` — hoy no se lee.

**Por qué existe**: los dos consumidores reales de hoy no la necesitan — [reconcile-subscriptions.worker.ts:200](src/shared/jobs/workers/reconcile-subscriptions.worker.ts:200) solo quiere el `approved` más reciente (`sort: date_created, criteria: desc`, toma `[0]`), y [reconcile-pending-payments.worker.ts:72](src/shared/jobs/workers/reconcile-pending-payments.worker.ts:72) / [mp-reconcile.service.ts:71](src/modules/payments/mp-reconcile.service.ts:71) buscan por booking individual (resultado chico). No es descuido: nunca hizo falta.

**Costo de no resolverla ahora**: ninguno hoy. Crece con la antigüedad de cada tenant — un historial de facturación SaaS completo (`GET /api/billing/invoices`, spec'd en doc15 §5.8, **sin implementar todavía**: no existe route handler ni Server Action) se vería incompleto sin aviso una vez que un tenant acumule más cobros mensuales que el límite de página default de MP.

**Costo estimado de resolverla**: bajo, ~1-2h. Loop interno sobre `paging.total` en `searchPaymentsByReference`, sin cambiar la firma (los 2 consumidores actuales no necesitan enterarse). No agregar parámetro de paginación explícito salvo que un consumidor futuro sí necesite control de página.

**Disparador de resolución**: cuando se implemente `GET /api/billing/invoices` / `listInvoices` (doc15 §5.8) — recién ahí hay un consumidor real que necesita el historial completo, no solo el último pago.

---

## 72 warnings sin triagear en dependency-cruiser (scan inicial)

**Qué es**: [.dependency-cruiser.mjs](.dependency-cruiser.mjs) traduce las 6 zonas de `turnogol/capas-*` (`eslint.config.mjs`) al grafo real de imports (alias `@/*` y relativos, incluye `import()` dinámico) más detección de ciclos, corriendo en CI ([dependency-cruiser.yml](.github/workflows/dependency-cruiser.yml)) en `severity: 'warn'` — advisory, no bloquea. El primer scan real (2026-08-28, 1257 módulos, 5543 dependencias) dio 72 violaciones sin triagear: 31 `no-components-to-modules-app-server`, 32 `no-circular`, 8 `no-lib-to-modules`, 1 `no-shared-to-domain-server-app`.

**Por qué existe**: dependency-cruiser ve el grafo de módulos resuelto, no la anotación TS — así que un `import type` legítimo cruzando capas (permitido por ESLint vía `allowTypeImports: true`) también aparece acá como violación. Sin triage previo no se puede saber cuánto de los 72 es ruido de ese tipo vs. gap real. Ya se verificó UNO a mano: `no-shared-to-domain-server-app` en [audit.ts:41](src/shared/db/audit.ts:41) es `await import('@/modules/auth/auth.middleware')` — dinámico, invisible para el `no-restricted-imports` de ESLint (solo mira `ImportDeclaration` estático), pero intencional (comentario F16: evita acoplar el bundle del worker). Los 32 `no-circular` son mayormente el patrón barrel `index.ts` re-exportando sus propios archivos (`notifications/templates/*`), un idiom común, no necesariamente un bug. Los 31+8 restantes (`components→modules`, `lib→modules`) no se leyeron todavía.

**Costo de no resolverla ahora**: ninguno — `severity: 'warn'` no falla CI, el ruido queda en el log del job. El riesgo es que se acumule sin que nadie lo mire y la herramienta se vuelva ruido ignorado (mismo patrón que ya pasó y se resolvió con `doctor.config.mjs`).

**Costo estimado de resolverla**: medio, ~3-4h. Mismo proceso que el triage de `react-doctor` (2026-07-04): leer cada violación, clasificar falso-positivo-verificado (documentar en `ignore.overrides` si dependency-cruiser lo soporta, o dejar como excepción explícita) vs. gap real (arreglar el import). Cuando una de las 6 zonas quede 100% triageada y limpia, subirla de `'warn'` a `'error'` en `.dependency-cruiser.mjs` — mismo patrón de "trinquete" que ya usa `eslint.config.mjs`.

**Disparador de resolución**: sin fecha fija — es el mismo ciclo de vida que tuvo `doctor.config.mjs`. Buen candidato para la próxima sesión de auditoría de código o cuando el ruido en el job de CI moleste lo suficiente como para justificar la hora.

---

## No hay forma de ofrecerle un plan a un solo complejo

**Qué es**: la tabla `plans` ([plans.ts](src/shared/db/schema/plans.ts)) tiene `is_active` y nada más para controlar visibilidad: un plan está prendido para todos o apagado para todos. Las dos consultas que arman el catálogo — `listActivePlans` ([billing.service.ts:92](src/modules/billing/billing.service.ts:92), pantalla del complejo) y su gemela del panel ([super-admin/tenants.service.ts:168](src/modules/super-admin/tenants.service.ts:168)) — filtran solo por `is_active = true`.

**Por qué existe**: hasta ahora los planes eran tres y públicos (Predio, Complejo, Estadio), así que un flag booleano alcanzaba. El primer caso que no entra apareció el 2026-08-28: el plan "Prueba interna — NO OFRECER" de $100/mes tiene que estar visible para que un complejo puntual se suscriba y arranque el ensayo P-02, pero no debería existir para nadie más.

**Costo de no resolverla ahora**: bajo mientras los complejos en producción sean los dos propios. El workaround es prender el plan, suscribir y apagarlo — verificado seguro para la suscripción que queda viva, porque los tres lugares que leen el plan de una suscripción en curso (`reconcile-subscriptions.worker.ts:346`, `billing.service.ts:816`, `dunning.service.ts:87`) hacen `JOIN plans` sin filtrar `is_active`. Dos agujeros conocidos: durante la ventana cualquier complejo en `trialing`/`active` que abra `/settings/facturacion` ve el plan, y **reactivar** una suscripción de un plan apagado falla con `PlanNotFoundError` porque ese camino sí pasa por `loadPlan` ([:283](src/modules/billing/billing.service.ts:283) y [:698](src/modules/billing/billing.service.ts:698)). El costo crece con el primer cliente pago real, y se vuelve bloqueante en el primer precio especial, plan heredado o piloto.

**Costo estimado de resolverla**: bajo-medio, ~2-3h. Migración nueva con una columna nullable en `plans` que apunte al tenant dueño del plan (NULL = público), las dos consultas del catálogo respetándola, y `loadPlan` aceptando el plan privado cuando el tenant coincide — eso último es lo que además arregla el caso de reactivación. Tests: catálogo de un tenant ajeno no lo lista, el dueño sí, y reactivación sobre plan privado no rompe.

**Disparador de resolución**: antes de que se suscriba el primer complejo que no sea de Lazar. Mientras tanto el workaround alcanza, y el procedimiento está escrito en [docs/qa/GUION-ENSAYOS-PLATA-2026-08-28.md](qa/GUION-ENSAYOS-PLATA-2026-08-28.md).

---

## `application.deauthorized` se descarta con 400: TurnoGol no se entera de una desvinculación

**Qué es**: MercadoPago emite `application.deauthorized` cuando un complejo revoca el permiso que le dio a TurnoGol para cobrar en su cuenta. TurnoGol no maneja ese evento — `grep` sobre [payment.schema.ts](src/modules/payments/payment.schema.ts), [mp-webhook.handler.ts](src/modules/payments/mp-webhook.handler.ts) y [el route handler](src/app/api/webhooks/mercadopago/route.ts) no devuelve una sola referencia. Además llega por el canal global del panel, sin `?tenant=` en la URL, así que el route corta con `missing tenant` (400) antes incluso de mirar la firma. Visto en el historial de webhooks de la app de Suscripciones el 2026-08-28: `400 - Fallida · application.deauthorized · 381048203 · 22/08 13:44 UTC`.

**Por qué existe**: el diseño asumió que la desvinculación se hace desde TurnoGol, donde sí hay una acción que limpia las columnas (`tenant.service.ts:367` pone `mp_connected_at = NULL`). El camino inverso —desvincular desde el panel de MercadoPago— no se contempló. El caso del 22/8 es de la cuenta del propio dueño durante la migración a dos aplicaciones, así que hoy no hay daño.

**Costo de no resolverla ahora**: ninguno mientras los complejos sean los dos propios. Con clientes reales, un complejo que revoque el permiso desde el panel de MercadoPago deja a TurnoGol creyendo que el token sigue vivo: `mp_connected_at` queda con fecha, el portal sigue exigiendo seña y el jugador se come el error recién al momento de pagar — o sea, el que descubre la desconexión es el cliente del cliente. Emparenta con F-003 de PROD_QA ("seña exigible sin MercadoPago conectado"), que sigue sin re-verificar.

**Costo estimado de resolverla**: bajo, ~2h. Aceptar el tipo en el schema del webhook y resolver el tenant por `mp_user_id` en vez de por `?tenant=` (el payload trae el user id de MercadoPago, que ya está en `tenants.mp_user_id`); al recibirlo, limpiar las columnas de MP igual que hace la desvinculación desde la UI y avisarle al dueño. Ojo con el orden del route handler: hoy el guard de tenant corre antes de validar la firma, así que hay que mover ese caso sin debilitar el guard para el resto.

**Disparador de resolución**: cuando se cierre el tema del par OAuth (`MP_CLIENT_ID` apuntando a la aplicación vieja) — decisión del dueño el 2026-08-28, para no tocar dos cosas del mismo circuito a la vez. Contexto completo en [docs/qa/GUION-ENSAYOS-PLATA-2026-08-28.md](qa/GUION-ENSAYOS-PLATA-2026-08-28.md).

---

## La devolución manual no está explicada, y la pantalla todavía promete el reembolso automático que se eliminó

**Qué es**: dos cosas del mismo tema. (a) El empty state de `/caja/devoluciones` ([PendingRefundsList.tsx:100](<src/app/(admin)/caja/devoluciones/PendingRefundsList.tsx:100>)) dice que las devoluciones pagadas por MercadoPago "aparecen una hora después: durante esa hora el sistema intenta devolverlas solo". Eso ya no es cierto: el reembolso automático por API se eliminó (PR #212) y la espera de una hora se sacó con él — el comentario de [refund.service.ts:141-150](src/modules/payments/refund.service.ts:141-150) lo dice explícitamente ("todas, desde el momento cero ... esperar una hora para mostrar una deuda que ya existe es solo esconderla"). O sea, el texto de la pantalla contradice al código que la alimenta. (b) No hay material que le explique al complejo cómo devolver de verdad: entrar a MercadoPago, ubicar el pago y usar "Devolver dinero". Es el gemelo del video que ya existe sobre los plazos de acreditación.

**Por qué existe**: el texto se escribió cuando el reembolso automático existía y era el camino principal; al eliminarlo se cambió el servicio y no la copia. El video nunca se grabó porque hasta el 2026-08-28 el circuito de Checkout Pro no había entregado un solo pago real, así que no había devolución real que mostrar.

**Costo de no resolverla ahora**: bajo con los dos complejos propios, real con clientes. El complejo lee "el sistema lo intenta solo" y espera una hora que no va a resolver nada; mientras tanto el jugador sigue sin su plata y el que queda mal es el complejo. Es la clase de detalle que erosiona la confianza justo en el flujo donde más importa.

**Costo estimado de resolverla**: (a) trivial, ~15 min — reescribir el empty state para que diga lo que el código hace. Ojo que el mismo archivo tiene más abajo ([:181-182](<src/app/(admin)/caja/devoluciones/PendingRefundsList.tsx:181-182>)) un texto que SÍ es correcto; el arreglo es alinear el de arriba con ese. (b) ~1h de grabación. **Verificar antes de grabar**: lo que TurnoGol manda a MercadoPago como `external_reference` es el UUID completo de la reserva ([mp-gateway.implementation.ts:129](src/modules/payments/mp-gateway.implementation.ts:129)), pero la pantalla de devoluciones le muestra al complejo el código corto — los primeros 8 caracteres en mayúscula ([booking-code.ts](src/lib/booking-code.ts)). Habría que confirmar en el panel real si buscar por ese código corto encuentra el pago; si no lo encuentra, el video tiene que enseñar a ubicarlo por monto y fecha, no por código.

**Disparador de resolución**: (a) en el próximo lote de fixes de UI de caja — es de 15 minutos y ya está localizado. (b) antes del primer complejo cliente, junto al resto del material de onboarding. Hay una devolución pendiente real de $100 en `complejo titi` (generada el 2026-08-28 en los ensayos) que sirve de material para grabarlo.

---

## La invitación de staff escanea hasta 10.000 usuarios de Supabase Auth para encontrar uno

**Qué es**: `findAuthUserByEmail` ([settings/equipo/actions.ts:42](<src/app/(admin)/settings/equipo/actions.ts:42>), duplicada en [super-admin/tenants/[id]/actions.ts](<src/app/(super-admin)/super-admin/tenants/[id]/actions.ts>)) pagina `listUsers` de a 1.000, hasta 10 páginas, y va comparando el email en memoria. Son hasta **10 llamadas a la API de Supabase Auth por cada invitación de staff**, y el propio comentario reconoce que es un rodeo: "supabase-js no expone lookup por email, así que paginamos listUsers de forma acotada".

**Por qué existe**: cuando se escribió, el SDK efectivamente no ofrecía búsqueda por email y la cantidad de usuarios era despreciable. Es best-effort declarado: si no lo ubica, el callback de login sincroniza `staff_user_id` igual (#47), así que nunca fue un bug, solo un costo.

**Costo de no resolverla ahora**: ninguno hoy. Es, eso sí, el **único hallazgo de la auditoría de performance del 2026-08-29 que escala con el total de usuarios de la plataforma y no con los de un complejo**: cada complejo nuevo, cada jugador registrado, hace más lenta la invitación de staff de todos los demás. Con 10.000 usuarios el corte de 10 páginas se alcanza y la búsqueda empieza a devolver `null` por agotamiento, no por ausencia — o sea que además deja de funcionar en silencio y cae siempre al fallback.

**Costo estimado de resolverla**: ~1-2h, pero necesita verificación real y por eso no entró en la auditoría. GoTrue expone `GET /auth/v1/admin/users?filter=<email>` desde v2; hay que confirmar contra el GoTrue que corre hoy en el proyecto (no contra la documentación) que el filtro existe y matchea por igualdad, no por prefijo. Alternativa si no: consultar `auth.users` directamente, que exige revisar qué permisos tiene el rol de servicio sobre el schema `auth`. Ninguna de las dos se puede probar sin Docker levantado o sin tocar producción, que es exactamente lo que frenó el fix.

**Disparador de resolución**: cuando la plataforma pase los ~2.000 usuarios registrados, o antes si alguna invitación de staff empieza a tardar de forma perceptible. Contexto completo en [docs/audit/BACKLOG-PERFORMANCE-DB.md](audit/BACKLOG-PERFORMANCE-DB.md).

---

## 20 índices sin uso registrado, que no se pueden dropear todavía

**Qué es**: el advisor de performance de Supabase reporta 20 índices con `idx_scan = 0` en producción (`idx_players_phone`, `idx_bookings_starts_at`, `idx_notifications_recipient`, los cinco de Torneos, etc.). Cada índice hace más lenta **cada escritura** de su tabla y ocupa disco, así que uno que nunca se lee es costo puro.

**Por qué existe**: no es un error — es que todavía no hay con qué decidir. La base de producción tiene 15 reservas y 2 complejos (medido el 2026-08-29), y varios de esos índices son de Torneos, un módulo detrás de un feature flag global apagado. "Nunca usado" sobre una base sin tráfico no dice nada sobre si el índice sirve.

**Costo de no resolverla ahora**: despreciable. 20 índices de más sobre tablas de 200 kB no se sienten.

**Costo estimado de resolverla**: ~1h cuando haya datos. El bloque 3 de [scripts/audit/top-queries.sql](../scripts/audit/top-queries.sql) ya lista los candidatos y marca cuáles respaldan un `UNIQUE` o una `EXCLUDE` constraint (esos **no se dropean nunca**, aunque nunca se escaneen: están para hacer cumplir la restricción). El resto se dropea en una migración nueva, como hizo `053_index_hygiene.sql`.

**Disparador de resolución**: cuando haya ~6 meses de tráfico real acumulado y el bloque 4 del script confirme que la ventana de estadísticas los cubre. Antes de eso, cualquier drop es adivinanza.

---

## La impersonación entra a las páginas pero no a los route handlers

**Qué es**: `isBlockedForStaff` ([guards.ts:47-51](src/modules/staff/guards.ts:47)) bypassea a propósito el lock de ciclo de vida cuando la sesión es una impersonación de SuperAdmin — soporte tiene que poder entrar a un complejo bloqueado para revisarlo antes de que el dueño reactive el pago. `withTenant` ([with-tenant.ts:96](src/server/middleware/with-tenant.ts:96)) hace el mismo chequeo de estado pero **no consulta la impersonación**, así que los 12 route handlers que lo usan responden 403 en esa sesión mientras la página que los llama carga entera.

**Por qué existe**: los dos guards nacieron en momentos distintos. El bypass se agregó al camino de páginas y Server Actions (hallazgo R2 del ensayo general, comentado en `guards.ts:28-33`); `withTenant` conserva el chequeo original, más viejo.

**Costo de no resolverla ahora**: acotado y ya mitigado en lo que se veía. El síntoma reportado —el panel de métricas mostrando "probá de nuevo en unos segundos" contra un complejo bloqueado, que era mentira— se arregló mostrando el mensaje real del servidor. Quedan dos superficies sin cubrir, ninguna con mensaje engañoso: el link **Exportar CSV** de `/analiticas` es un `<a href>` directo a `/api/reports/revenue`, así que durante una impersonación navega al JSON del 403 en vez de bajar el archivo; y `/api/admin/push/*` falla en silencio, que ahí sí es deliberado (`PushNotificationManager` es fire-and-forget por diseño). Lo que incomoda del diseño: durante una impersonación se pueden **crear reservas y mover caja** —las Server Actions sí tienen el bypass— pero no leer las métricas. El gate laxo quedó en el camino que muta y el estricto en el que solo lee.

**Costo estimado de resolverla**: bajo, ~1-2h. `withTenant` consultando `getImpersonationSession()` con el mismo criterio que `isBlockedForStaff`, y un test que fije que un tenant `blocked` sigue cortado SIN impersonación (el riesgo real del cambio es aflojar el gate para todos). El CSV se arregla aparte: ocultar el link cuando el tenant no está operativo, o que el route handler responda un CSV de una línea con el motivo en vez de JSON.

**Disparador de resolución**: cuando soporte necesite de verdad operar sobre un complejo bloqueado —hoy no pasó nunca fuera de los ensayos— o si aparece una tercera superficie afectada. Decisión del dueño el 2026-08-30: arreglar el mensaje ahora y dejar el gate como está.

---

## El mapa de `/explorar` no siempre monta sus pines bajo la carga del shard de Stories

**Qué es**: [ExplorarSplitView.stories.tsx](<src/app/(public)/explorar/components/ExplorarSplitView.stories.tsx>) falla de forma intermitente en `Stories shard 1/3 (light)`, y solo ahí. Dos formas distintas del mismo síntoma: `HoverResaltaPinEnMapa` encuentra el pin de precio sin el `backgroundColor` esperado, y `Composicion` no encuentra el nodo del pin en absoluto (`findByText('$ 11.000')` en la línea 75). Cuando falla, el archivo tarda ~16 s; corriéndolo aislado tarda ~1,1 s y pasa 3 de 3.

**Por qué existe**: el mapa entra por `next/dynamic({ ssr: false })` y los marcadores los monta Leaflet de forma asincrónica. Las stories esperan con `findBy*`/`waitFor`, que alcanza en condiciones normales. Lo que no está claro es por qué bajo la carga del shard —94 archivos de story compartiendo una sola página de Chromium, que `@vitest/browser` nunca recarga entre archivos— el montaje a veces no llega nunca dentro del timeout. La hipótesis viva es presión de memoria del renderer, la misma clase que ya obligó a poner `--disable-dev-shm-usage` en [vitest.storybook.config.ts](vitest.storybook.config.ts) por el cuelgue del PR #122.

**Costo de no resolverla ahora**: un check BLOQUEANTE que se pone rojo sin causa en el diff, y que se destraba re-corriendo. El costo real no es el minuto de rerun: es que entrena a leer ese check como ruido, y el día que marque una regresión de verdad nadie le va a creer. Frecuencia observada: 2 de 3 corridas en una rama, 0 en las 10 corridas previas de otras ramas — o sea que aparece en rachas, no de forma pareja.

**Costo estimado de resolverla**: medio, ~2-4h, y la mayor parte es diagnóstico, no arreglo. No se reproduce localmente corriendo el archivo solo: hay que correr el shard 1/3 completo con `--shard=1/3` para recrear la carga, y recién ahí instrumentar si el iframe llega a montar Leaflet. Ojo con el atajo: envolver las aserciones en más `waitFor` NO alcanza y puede empeorar — `findByText` anidado dentro de `waitFor` se come el presupuesto del `waitFor` y le deja un solo intento (probado y revertido en el PR #264, commits 39668e2b y b041b72f). El patrón correcto, si el camino termina siendo esperar mejor, es `getByText` adentro del `waitFor`.

**Disparador de resolución**: cuando el rojo aparezca en una rama que no sea la que lo descubrió —o sea, cuando deje de ser una racha y empiece a costarle reruns a otro—, o cuando se toque `ExplorarMap`/`ExplorarSplitView` por producto. Si en el medio aparece un tercer test del mismo archivo fallando, subir la prioridad: sería señal de que el montaje del mapa empeora, no de que la aserción es frágil.

**El disparador se cumplió (2026-09-03)**: apareció en `claude/turnogol-8-bugs-mutation-da6095` (PR #265, campaña de mutación), una rama que no toca nada de `explorar` ni de mapas — su diff contra main no tiene un solo archivo de esa zona. Confirmado como flake por el experimento que corresponde: re-correr el MISMO commit (`2e1de76f`) pasó en verde sin tocar una línea. Costó dos reruns y ~20 minutos de diagnóstico a alguien que no tenía forma de saber que era conocido. No apareció un tercer test del archivo, así que la prioridad queda donde está, pero ya no es "una racha en una rama".

**Corrección al diagnóstico: NO es solo `light`.** Cuatro corridas de esa misma rama, sin cambios en `explorar` entre ellas: `7849d87e` verde · `2e1de76f` rojo en **shard 1/3 (light)** con las dos stories · rerun de `2e1de76f` verde · `c2639595` rojo en **shard 1/3 (dark)**, esta vez solo `HoverResaltaPinEnMapa`. O sea que el tema no es una variable —falla igual en los dos— y la cantidad de stories que caen tampoco es fija. Lo estable es el archivo y el shard. Quien lo agarre: no gaste tiempo buscando qué tiene `light` de distinto, y mida sobre `--shard=1/3` en ambos temas.

### RESUELTA (2026-09-03) — no era Leaflet montando lento, era el chunk que no llegaba

Escaló a romper `main` (run `33815294877`, los **dos** intentos rojos sobre `c1c2f3cc`), así que se diagnosticó.

**Cómo se reprodujo, que era la parte cara**: el shard solo no alcanza en una máquina de 16 núcleos —3 de 3 verde—; lo que lo reproduce es shard **más contención de CPU**. Con 14 procesos quemando núcleos en paralelo al `--shard=1/3`, la frecuencia sube a **5 de 14**. Ese harness es la herramienta reusable para cualquier flake de Stories que solo aparezca en CI: el runner de GitHub tiene 4 núcleos, no 16, y la diferencia era todo.

**Causa raíz, medida con una sonda en el `catch` del `findByText`**: a los 15 s (el `asyncUtilTimeout` de `.storybook/preview.tsx`) la columna del mapa seguía siendo **el placeholder de `next/dynamic`** — `aria-busy="true"`, cero `.leaflet-container`, cero `.leaflet-marker-icon`. O sea que Leaflet no estaba montando despacio: el `import('./ExplorarMap')` **no resolvía nunca** dentro del presupuesto. En este runner ese `import()` es un pedido al dev server de Vite, y la primera story del archivo paga ahí la transformación de `ExplorarMap` + react-leaflet + `leaflet/dist/leaflet.css`. Por eso caía siempre en la primera story que mira el mapa y la segunda pasaba: para entonces el módulo ya estaba en cache. La hipótesis vieja (presión de memoria del renderer) queda descartada.

**Fix**: un `import './ExplorarMap'` estático arriba del archivo de story. Lo mete en el grafo de módulos del ARCHIVO, así se carga antes de que arranque el primer test —fuera del presupuesto de cualquier `findBy*`— y el `import()` del loader resuelve del cache. No se tocó ninguna aserción.

**Evidencia**: mismo harness de contención, **0 fallos en 14 corridas** con el fix, contra 5 en 14 sin él.

**Dos hipótesis que se falsearon en el camino**, para que nadie las vuelva a pagar: (1) que el puntero quedara sobre una fila de la lista por culpa de una story anterior de la misma página, dejando `activeId` seteado — se reprodujo el escenario a mano y los dos pines salen inactivos; (2) que el `<Popup>` de cada marker duplicara el nodo del precio dentro de la columna del mapa — react-leaflet no monta el contenido del popup hasta abrirlo (medido: 1 nodo por precio, 0 `.leaflet-popup` en el documento).

**La clase**: se barrieron los 8 archivos de story que renderizan un componente con un loader `next/dynamic` adentro. `ExplorarSplitView` era el único que **asserta sobre el hijo dinámico**; el más parecido, `BookingSuccessExtras.stories.tsx` (también carga Leaflet así), nunca lo mira. No hay más instancias que arreglar hoy.
