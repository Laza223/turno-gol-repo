# Notificaciones útiles y confiables — ledger

## Contrato aprobado

Implementar el plan aprobado por Lazar el 2026-11-06: notificaciones nativas siempre visibles, activación y prueba por dispositivo para dueño/encargado, outbox transaccional recuperable, política por persona y agenda a las 08:00 ART con cambios de primera reserva. Jugadores y sus canales no cambian. No se modifica el lifecycle ni se reembolsa por API.

Juez inmutable: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm knip`; unitarios de lógica, integración/RLS y flujo real de activación. La entrega física en iPhone de el complejo piloto y Android es un gate separado que requiere esos dispositivos. No declarar verificación física desde un emulador.

Estado inicial: rama `feat/panel-mobile-denso`, sin diff tracked; untracked previos ajenos preservados. Cinco archivos unitarios: 55 tests aprobados en diagnóstico. Credencial de producción disponible rechazada; no se conoce aún la causa específica de el complejo piloto. Docker local inicialmente detenido.

## Decisiones técnicas

- Flag `staff_notifications_v2`, default global false, resuelto en la transacción para no mezclar canales por caché. Mantener emisores legacy cuando está apagado.
- Extender `notifications` con canal push, event_key, available_at y expires_at; unicidad por evento/persona/canal. `push_send_log` conserva filas históricas y agrega estado por dispositivo, intentos y leases recuperables. No reinterpretar un claim histórico como entrega acreditada.
- Intenciones nuevas se insertan junto al evento de negocio. El barrido recupera lo que no pudo encolar el proceso web. El proveedor se llama fuera de transacciones.
- Contrato `StaffNotificationEvent` en `staff-notification.types.ts`: tenantId, eventKey, type, payload, audience (`staff`/`owners`), policy (`push_only`/`push_preferred`/`email_and_push`), email opcional (templateName/content), notBefore opcional y expiresAt.
- API compartida: `isStaffNotificationsEnabled(tenantId, tx)`, `enqueueStaffNotification(event, tx): Promise<string[]>`, `processQueuedStaffNotifications(): Promise<void>`.
- Payload de dispositivo: eventId estable; deliveryId, receiptToken y receiptUrl para recibos firmados de procesado/apertura. El recibo no acredita que el humano vio el aviso. Endpoint `/api/public/push/receipt`, sin depender de sesión del teléfono.
- Estado de agenda en `staff_agenda_state`: una fila por tenant, operating_date, first_booking_id, first_starts_at, revision, started, updated_at. Cache operacional tenant-scoped, sin datos de personas, RLS y grants explícitos. El primer aviso se identifica por revisión inicial; started es un latch para no avisar por avance del reloj.
- Migración nueva 107 y espejo `20260424000107_staff_notifications.sql`. SQL local para pruebas aisladas; aplicar producción queda a Lazar. No editar migraciones existentes ni ejecutar db:push/db:migrate/db:sync-supabase.

## Canales

- Confirmación online y cancelación del jugador: staff activo, push_preferred. Nada de aviso al iniciar un hold.
- Agenda y cambios de primera reserva: staff activo, push_only, inclusive día sin reservas.
- Incidentes de cobro/devolución y MP desconectado: destinatarios autorizados, push_preferred; reutilizar umbrales existentes.
- Plan: dueños, email_and_push. Bienvenida/acceso/seguridad conservan email. Semanal conserva opt-in; se retira diario de ayer al habilitar v2.
- Backup email único por persona únicamente sin suscripciones o con fallo terminal en todos los dispositivos; aceptación de uno inhibe fallback. Falta de recibo no dispara email. Agenda nunca genera email.
- Silencio 00–08; test manual queda inmediato. Expirar mensajes de turnos al comienzo y agenda al perder vigencia.

## Paquetes y delegaciones

| Paquete | Responsabilidad exclusiva | Presupuesto inicial | Resultado/costo |
|---|---|---|---|
| A — entrega | Outbox, schemas/migración 107, sender/worker, recibos, tipos y pruebas propios | 23 archivos, ~2600 líneas nuevas | Implementado; revisión fresca aprobada. Interrupción de cuota antes de cierre propio; verificación integrada por root/revisor. Costo no expuesto |
| B — dispositivo | SW, UI/acciones de suscripción/prueba, acceso desde header/layout, rutas legacy de suscripción, tests propios | Ampliado a 24 archivos para contratos de ruta/slug/robots/schema y tests | 12 archivos de tests/206 casos passed; formato/tipos/lint propios verdes. UI autenticada pendiente. Costo no expuesto |
| C — agenda | Agenda service/sweep diario, retiro opt-in diario, pruebas de emisores y DB aislada | 12 archivos iniciales + test emisores/fixtures y catchup semanal autorizados | Integración 12 archivos/57 casos passed; catchup semanal 13 casos passed. Aislamiento en curso. Costo no expuesto |
| Principal | Emisores transaccionales, compatibilidad, monitoreo, integración, docs y judge | Ampliado a 23 archivos por regresiones de revisión y aislamiento de tests | Emisores conectados, revisión independiente aprobada, suite completa 7666 passed. Costo no expuesto |
| Revisión fresca | Diff antes que ledger, búsqueda de pérdida/duplicación/horarios/permisos | Sólo lectura | APROBADO; tres hallazgos corregidos y refutados. Costo no expuesto |
| Gate de release | Cuatro comandos sobre freeze final | Sólo lectura | 4/4 exit 0 con huella de 2924 archivos idéntica antes/después. Producción NO-GO hasta migración/secreto/despliegue/piloto físico. Costo no expuesto |

Los agentes no lanzan otros agentes. Cada uno respeta las ediciones ajenas, no hace commit/push y comunica cambios de contrato antes de aplicarlos. Verificador fresco lee el diff antes del resumen.

## Verificación y pendientes externos

### Incidente local de verificación

Una ejecución delegada de `tests/integration/staff-notifications.test.ts` corrió contra `.env.test` (:54322/postgres) antes de recibir la indicación de esperar una DB aislada. Ejecutó `ensureRoles()` y `cleanupAll()` (TRUNCATE de fixtures con CASCADE), luego los nueve casos fallaron por migración 107 ausente. No se aplicaron migraciones ni se tocó producción. No hay evidencia de preservación de datos locales previos; comunicado a Lazar en el chat. No reseed automático del entorno habitual ni intentos de reconstrucción sin evidencia. Desde ese punto sólo se ejecuta integración en una base descartable mediante `TURNOGOL_TEST_ENV_FILE`.

### Evidencia parcial

- Paquete C: cuatro archivos / 20 unit tests passed, ESLint propio y formato verdes; typecheck integrado exit 0. Siete casos de integración pendientes de entorno aislado. Costo del subagente no expuesto por el harness.
- Principal: TDD del adaptador de templates falló primero por módulo ausente; posteriormente cinco tests passed. Nuevas políticas exigen adaptar mocks de flags en suites legacy, sin quitar asserts del comportamiento.

- [x] Pruebas de regresión que fallan antes del cambio.
- [x] Unitarios, integración y aislamiento con rol restringido real.
- [x] Cuatro comandos corridos por root y por verificador final independiente tras freeze.
- [x] Revisión independiente y navegación real admin/manager, claro/oscuro/mobile e instrucciones iPhone.
- [ ] Alta push real, resincronización, baja y prueba correlacionada: no acreditadas en navegador de este entorno.
- [ ] Migración aplicada en producción por Lazar.
- [ ] Credencial de lectura vigente para diagnóstico de el complejo piloto.
- [ ] iPhone de el complejo piloto + Android: abierta/background/cerrada/bloqueada.
- [ ] Habilitar flag sólo tras piloto acreditado.

### Evidencia integrada 2026-11-06

`pnpm test`: `Test Files 614 passed | 1 skipped (615)`; `Tests 7666 passed | 1 todo (7667)`; exit 0. Regresión quiet-hours de legacy y durable: 17 tests passed después del ajuste final. Primer run completo detectó cinco fallos de contratos de ruta nueva (inventario, robots, slug reservado, sólo lectura, schema Zod); corregidos en fuentes/registro conservando los asserts.

Juez root: `pnpm format:check` → `All matched files use Prettier code style!`; `pnpm lint` → `0 errors, 3 warnings` preexistentes en AbonadoDialogs/FavoritesList/FavoriteButton; `pnpm typecheck` → exit 0; `pnpm knip` → exit 0 (hint preexistente `.mdx`). Se usa `npm_config_manage_package_manager_versions=false` porque el wrapper de pnpm instalado 12.4.2 intenta descargar otra versión y queda sin salida; no se modificó package.json ni lockfile.

DB descartable independiente `codex-turnogol-notifications-test`, Postgres 17, puerto 127.0.0.1:54328. Bootstrap canónico 001..107 exit 0. `TURNOGOL_TEST_ENV_FILE=.env.notifications-test`: tres suites nuevas y nueve legacy, 57 tests passed; emisores reales cubren hold sin aviso, confirmación única, cancelación/replay y rollback. Catchup semanal 08:01 y segundo tick sin recalcular: 13 casos passed entre integración y unit.

Revisión fresca refutó: (1) dedupe estático que ocultaba futuros ciclos de mora, (2) recordatorios por push que bloqueaban la selección de otras devoluciones, (3) reintentos cruzando medianoche. La clase (3) se corrigió también en el worker legacy. La base parcial `codex_notifications_20261106` creada durante el primer intento de aislamiento se retiró; no se aplicó 107 a la base habitual 54322/postgres.

`pnpm test:isolation`: un archivo, 190 tests passed. `pnpm test:isolation:rol-real`: cuatro archivos, 324 tests passed. El primer run de rol real detectó que faltaba registrar/sembrar la nueva tabla singleton en el arnés (que asumía PK `id`): se agregó clasificación, fila A/B y PK `tenant_id` sin quitar aserciones, incluyendo cinco operaciones de aislamiento para la tabla nueva. La migración/policy no requirió cambios.

El script Bash adicional `scripts/audit-verify.sh` no pudo ejecutarse en el sandbox; la escalación fue rechazada por auto-review por tratarse de un script adicional que podía reemplazarse por los checks directos. Se ejecutan los cuatro comandos acordados por separado y se conserva evidencia de `pnpm test`; no se afirma ejecución del script Bash. No se eludió la aprobación.

No se encontró respaldo `.dump`, `.backup`, `.bak` o `*backup*.sql` en repo/supabase para acreditar recuperación del incidente local. La base habitual no fue reseedeada ni reconstruida a ciegas.

Gate final independiente, sesión 99540: format_exit=0 (`All matched files use Prettier code style!`), lint_exit=0 (`0 errors, 3 warnings`), typecheck_exit=0, knip_exit=0 (hint `.mdx` preexistente). Migración 107 y espejo idénticos; `git diff --check` exit 0. Huella fuente/tests/public/scripts antes/después: `0327D66E63C1FCA59EA31F9E1E29361647D2061985CC78B4481A29620ECE73E6`. Veredicto: checks locales verdes, NO-GO producción por gates externos pendientes. No se acredita build completo ni e2e completo de CI.

UX fresca: admin y manager acceden a `/notificaciones` y navegan Hoy/campana/volver con respuestas 200; claro, oscuro y móvil de 390px sin overflow. iPhone emulado muestra guía de instalación/iOS16.4. Consola/pageerrors/requests fallidos finales vacíos. Un panic inicial de caché de Turbopack se resolvió apartando artefactos generados; no requirió cambio productivo.

El primer intento de activar falló controladamente porque la VAPID local heredada de entorno tenía 63 bytes (`InvalidAccessError`); 0 suscripciones. Se generó par válido de 65 bytes y secreto de recibos descartables SÓLO en `.env.notifications-test` ignorado para repetir el ensayo, sin cambiar `.env.local` ni producción. Activación/desactivación/prueba remota y dispositivos físicos todavía no acreditados al registrar este corte.

Ensayo adicional final de UX con VAPID válida de 65 bytes, GET vapid 200 y `Notification.permission=granted`: el `PushManager.subscribe` NATIVO de Chromium rechazó `AbortError: Registration failed - permission denied`. La UI recuperó el botón y mostró el error; 0 suscripciones y ningún error HTTP>=400 o de página. No se llegó al backend de suscripción y no se atribuye el rechazo a FCM sin evidencia. No se puede acreditar alta/resync/baja/test remoto desde este runner. Screenshot `.next/ux-notifications-valid-vapid-error.png`; navegador/servidor cerrados. Fuente sin cambios posteriores a la huella del verificador final. No hay commit/push ni despliegue.

### Publicación del PR autorizada

Lazar pidió abrir el PR y seguir el CI, reservándose el merge. Se preparó `codex/notificaciones-push-confiables` desde `origin/main` (767e318a), porque los commits previos del checkout original ya entraron por squash y no deben volver al diff. Se copiaron únicamente 57 archivos modificados y 32 nuevos del esfuerzo; los untracked previos ajenos no se publican. Las observaciones nuevas del cliente se anonimizan en la documentación pública.

Juez repetido sobre la rama limpia: formato, lint, typecheck y knip exit 0; lint conserva tres warnings previos. `pnpm test`: `Test Files 614 passed | 1 skipped (615)`; `Tests 7667 passed | 1 todo (7668)`, exit 0. CI remoto se sigue después de abrir el PR. No merge automático. Antes del merge/despliegue se requiere aplicar 107 en producción; antes del piloto configurar secreto de recibos y acreditar teléfonos reales.

Hallazgo UX preexistente 🟡: `src/components/ui/toast.tsx:30` fija el viewport en bottom0/z100 y un toast móvil puede interceptar clicks en la navegación inferior hasta cerrarlo. Se reprodujo en error de activación. Toast/toaster/hook no tienen diff de este esfuerzo; bug a resolver en el próximo ajuste de notificaciones/toasts móviles. No bloquea acceso a la pantalla y se puede cerrar manualmente. Evidencia y capturas de UX en `.next/ux-notifications-*`.
