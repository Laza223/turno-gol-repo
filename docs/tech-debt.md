# Deuda técnica — TurnoGol

Ledger de deuda registrada (`código anda pero el costo de mantenerlo crece`), no backlog de features.
Formato por entrada: qué / por qué existe / costo de no resolver / costo de resolver / disparador.
Revisar en cada retrospectiva del esfuerzo relacionado — ver skill `deuda-tecnica`.

---

## ~~`searchPaymentsByReference` sin paginación~~ — RESUELTA 2026-09-01

**Qué era**: [mp-gateway.implementation.ts](src/modules/payments/mp-gateway.implementation.ts) llamaba `search(...)` sin `limit`/`offset` y sin leer `paging`, así que devolvía sólo la primera página.

**Por qué esta entrada estaba MAL**: el disparador escrito acá era "cuando se implemente `GET /api/billing/invoices` / `listInvoices` (doc15 §5.8)", y la entrada afirmaba que ese endpoint estaba "**sin implementar todavía**: no existe route handler ni Server Action". Era falso — existen los dos: [route.ts](<src/app/api/billing/invoices/route.ts>) y `listInvoices` ([billing.service.ts:907](src/modules/billing/billing.service.ts:907)), que llama a este método y mapea lo que llega sin mirar `paging`. **El disparador se había cumplido sin que nadie lo notara**, y el síntoma era silencioso: en cuanto un complejo acumulara más cobros mensuales que el tamaño de página de MP, su historial de facturación se veía cortado sin ningún aviso.

**Cómo se resolvió**: loop interno sobre `paging.total`, sin cambiar la firma. La primera llamada queda idéntica (sin `limit`/`offset`) y es MercadoPago quien informa su propio tamaño de página — elegirlo nosotros sería adivinar un valor que el endpoint puede rechazar y que no se puede verificar sin credenciales reales. Sin `paging` degrada a una página; tope de 20 páginas por si MP reportara un total inconsistente. Tests: `tests/unit/mp-gateway-search-paging.test.ts` (7 casos, control positivo corrido).

**Lección para el ledger**: un disparador escrito contra "cuando exista X" envejece sin avisar si nadie vuelve a verificar que X siga sin existir.

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

## ~~`application.deauthorized` se descarta con 400~~ — RESUELTA 2026-09-01

**Qué era**: MercadoPago emite `application.deauthorized` cuando un complejo revoca el permiso que le dio a TurnoGol para cobrar en su cuenta. TurnoGol no manejaba ese evento: llega por el canal global del panel, sin `?tenant=` en la URL, así que moría en `missing tenant` (400). Visto en el historial de webhooks de la app de Suscripciones el 2026-08-28: `400 - Fallida · application.deauthorized · 381048203 · 22/08 13:44 UTC`.

**El daño que evitaba quedar abierto**: con clientes reales, un complejo que revoca el permiso desde el panel de MercadoPago dejaba a TurnoGol creyendo que el token seguía vivo — `mp_connected_at` con fecha, el portal exigiendo seña — y el que descubría la desconexión era el jugador, al momento de pagar. O sea, el cliente del cliente.

**Cómo se resolvió**: el complejo se resuelve por `mp_user_id` contra el UNIQUE parcial de la migr. 069, y el `?tenant=` de la query se IGNORA a propósito — esto termina en un UPDATE destructivo sobre credenciales de cobro, así que el criterio del propio route ("el complejo lo dice MercadoPago, no quien manda el request") tiene que valer sin excepción. Los efectos reusan `disconnectMercadoPago`, el mismo camino que la desvinculación desde la UI, que además apaga `requires_deposit` (F-003). Audit log con la cuenta y el origen, y mail sólo al rol admin. Tests: `tests/unit/mp-webhook-deauthorized-route.test.ts` + `tests/unit/mp-webhook-handler-deauthorized.test.ts` (11 casos).

**Dos correcciones a lo que decía esta entrada**:
1. "el route corta con `missing tenant` (400) **antes incluso de mirar la firma**" — ya no era cierto cuando se resolvió. El PR #254 invirtió ese orden: la firma se valida primero (comentario explícito en el route: "La firma se valida ANTES de resolver el complejo"). La parte delicada del fix, mover el caso sin debilitar el guard, no hizo falta.
2. El schema NO necesitó una excepción para `data.id`: lo que trae es el id de usuario de MercadoPago, numérico, que `MP_ID_RE` ya aceptaba. Por eso el evento del 22/8 murió en "missing tenant" y no en "invalid payload".

**Lo que quedó sin confirmar**: si el nombre del evento viaja en `type` o en `action`. El panel muestra una sola columna y no lo distingue, y los dominios de MercadoPago están bloqueados por el proxy de egress del entorno donde se escribió el fix. Se aceptan las dos codificaciones —el string exacto es el mismo— así que no hace falta resolverlo, pero conviene saberlo si alguien depura esto.

---

## El video de la devolución manual todavía no existe

**Qué es**: no hay material que le explique al complejo cómo devolver de verdad — entrar a MercadoPago, ubicar el pago y usar "Devolver dinero". Es el gemelo del video que ya existe sobre los plazos de acreditación.

**Corrección a lo que decía esta entrada** (verificado el 2026-09-01): la mitad (a) —el empty state de `/caja/devoluciones` prometiendo que "el sistema intenta devolverlas solo" durante una hora— **ya se corrigió en el PR #259**. Hoy [PendingRefundsList.tsx](<src/app/(admin)/caja/devoluciones/PendingRefundsList.tsx>) dice "Devolvés vos desde MercadoPago, transferencia o efectivo; acá queda registrado", que es lo que el código hace. El ledger la seguía cobrando como abierta.

**Por qué existe la mitad que queda**: el video nunca se grabó porque hasta el 2026-08-28 el circuito de Checkout Pro no había entregado un solo pago real, así que no había devolución real que mostrar.

**Costo de no resolverla ahora**: bajo con los dos complejos propios, real con clientes — es el flujo donde más importa que el complejo sepa qué hacer, porque mientras tanto el jugador sigue sin su plata.

**Costo estimado de resolverla**: ~1h de grabación. **Verificar antes de grabar**: lo que TurnoGol manda a MercadoPago como `external_reference` es el UUID completo de la reserva ([mp-gateway.implementation.ts](src/modules/payments/mp-gateway.implementation.ts)), pero la pantalla de devoluciones le muestra al complejo el código corto — los primeros 8 caracteres en mayúscula ([booking-code.ts](src/lib/booking-code.ts)). Habría que confirmar en el panel real si buscar por ese código corto encuentra el pago; si no lo encuentra, el video tiene que enseñar a ubicarlo por monto y fecha, no por código.

**Disparador de resolución**: antes del primer complejo cliente, junto al resto del material de onboarding. Hay una devolución pendiente real de $100 en `complejo titi` (generada el 2026-08-28 en los ensayos) que sirve de material para grabarlo.

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

## ~~La impersonación entra a las páginas pero no a los route handlers~~ — RESUELTA 2026-09-01

**Qué era**: `isBlockedForStaff` ([guards.ts:47-51](src/modules/staff/guards.ts:47)) bypassea a propósito el lock de ciclo de vida cuando la sesión es una impersonación de SuperAdmin — soporte tiene que poder entrar a un complejo bloqueado para revisarlo antes de que el dueño reactive el pago. `withTenant` ([with-tenant.ts](src/server/middleware/with-tenant.ts)) hacía el mismo chequeo de estado pero **no consultaba la impersonación**, así que los 12 route handlers que lo usan respondían 403 en esa sesión mientras la página que los llama cargaba entera.

**Lo que incomodaba del diseño**: durante una impersonación se podían **crear reservas y mover caja** —las Server Actions sí tienen el bypass— pero no leer las métricas. El gate laxo había quedado en el camino que muta y el estricto en el que sólo lee.

**Cómo se resolvió**: `withTenant` consulta `getImpersonationSession()` con el mismo criterio que `isBlockedForStaff` — es la misma función que ya usa el guard de páginas, no se escribió lógica nueva. La consulta se hace sólo cuando el estado ya es bloqueante, así que el 99% de las requests de un complejo sano no la paga (hay un test que lo fija).

**El riesgo del cambio era aflojar el gate para todos**, así que los tests están escritos con el negativo primero: `blocked`/`churned`/`deleted` siguen en 403 SIN impersonación, y `suspended` sigue siendo sólo-lectura para las mutaciones. Control positivo corrido: anulando el fix, los 5 tests del bypass se ponen rojos y los 5 del guard siguen verdes. `tests/unit/with-tenant-impersonation-bypass.test.ts`.

**El síntoma del CSV, aparte**: `Exportar CSV` de `/analiticas` es un `<a href>` directo a `/api/reports/revenue`, así que durante una impersonación navegaba al JSON del 403 en vez de bajar el archivo. El PR #259 le puso manejo de error al botón ([ExportCsvButton.tsx](<src/app/(admin)/analiticas/ExportCsvButton.tsx>)) — el ledger no lo registraba; esto arregla la causa. `/api/admin/push/*` sigue fallando en silencio, que ahí sí es deliberado (`PushNotificationManager` es fire-and-forget por diseño).

---

## La auditoría de tests del 29-30/8 no está en el repositorio

**Qué es**: la [bitácora](BITACORA.md) registra, los días 29 y 30 de agosto, una auditoría de tests completa: coverage instalado y medido por primera vez en el repo (línea base corregida a **76,70%**), grafo import→test, métricas por archivo, un runner de mutación con tripwire de árbol limpio, y `docs/qa/TEST_AUDIT.md` — 901 líneas, 15 ítems de plan en 2 bloques, 204 de 327 archivos auditados uno por uno, 722 mutantes emitidos y **397 huecos demostrados** (190 en roja, 207 en amarilla), más un 🔴 de plazo de borrado verificado contra el código.

**Nada de eso existe.** Verificado el 2026-09-01: `git log --all -- docs/qa/TEST_AUDIT.md` no devuelve un solo commit, no hay dependencia de coverage en `package.json`, y no hay runner de mutación en `scripts/`. El PR #256 mergeó únicamente la parte de performance del esfuerzo; el resto quedó en el contenedor de esa sesión y se fue con él.

**Por qué existe**: el trabajo se hizo sobre la rama `perf/indices-n1-cache` DESPUÉS de que su PR se mergeara (#256 entró 04:06 del 29/8; las entradas de bitácora siguen hasta las 16:47 del 30/8). Sin un commit y un push, una sesión remota no deja rastro: la bitácora la escribe un hook al cerrar y registra lo que se hizo, no lo que quedó guardado.

**Costo de no resolverla ahora**: no hay riesgo en producción — es trabajo de diagnóstico perdido, no código faltante. El costo es que la próxima vez que alguien quiera saber qué tan cubierto está el repo, arranca de cero: sin línea base, sin grafo y sin los 397 huecos ya localizados.

**Costo estimado de resolverla**: ~2 días para reconstruirlo completo. Partible: el **harness** solo (instalar `@vitest/coverage-v8`, agregar el script y medir la línea base) son ~1-2h y es la parte durable — con un número medido, la próxima sesión arranca comparando en vez de descubriendo. Los 397 huecos hay que volver a demostrarlos igual.

**Disparador de resolución**: la próxima sesión que vaya a tocar la estrategia de tests. Decisión del dueño el 2026-09-01: registrarla ahora y no reconstruirla, para no competir con los fixes de plata de esa sesión.

**Lección, y es la razón por la que esta entrada existe**: lo que no está commiteado y pusheado no existe, por más que la bitácora lo cuente en detalle.
