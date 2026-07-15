# Ensayo General de Producción — Matriz de acciones + Ledger

> **Qué es esto**: guion del ensayo general pre-launch (2026-07-14). Cada fila es una acción real de la app que se ejecuta DE VERDAD (browser real, MercadoPago sandbox, time-travel de fechas) y se cierra con evidencia. No es una suite de tests: es la validación de que las funcionalidades devuelven lo que tienen que devolver.
>
> **Fuentes**: `docs/spec/doc7_flujos_e2e.md` (9 flujos E2E), `docs/spec/doc8_user_stories.md` (42 US), `tests/e2e/README.md` + specs reales, `CLAUDE.md`, migraciones (`003/004/025`) y código.
> **Convención de estados**: `canceled` (una L), `canceled_refunded`, `canceled_no_refund`, `no_show`. Montos en centavos ARS integer. UUIDs.
> **Ejecutor**: **FABLE** = dinero real sandbox/push/time-travel (orquestador con browser). **SONNET** = CRUD/UI con click + inspección DB (agentes fan-out). **E2E** = ya cubierto por spec Playwright existente (se corre la suite, no se repite a mano).
> **⚠️** = resultado esperado no confirmado 100% en spec/código — verificar en vivo antes de dar por bueno el criterio.
>
> **Contexto del fix P0 (2026-07-14)**: antes de este ensayo, el grupo K era INEJECUTABLE — `createTenantWithTrial` no sembraba `tenant_subscriptions` y no existía UI de subscribe. Fix aplicado (1a/1b/1c) sin commitear; K1 asume ese fix presente.

---

## A) Auth + Onboarding

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| A1 | Registro de cuenta del dueño | `/registrar` → email + password (≥8) + nombre + celular `+54 9...` → "Crear cuenta" | `staff_users` fila nueva (`status='active'`); `auth.users` con `email_confirmed_at IS NULL`; NO se crea `tenants` todavía (doc7 Flujo 1 Paso 1; "Abandono en paso 2") | `SELECT * FROM staff_users WHERE email=...`; `SELECT count(*) FROM tenants` no aumentó | E2E — `onboarding.spec.ts` |
| A2 | Wizard completo (4 pasos) → primer Tenant | Login post-verificación → wizard completo | `tenants.status='trialing'`, `trial_ends_at=NOW()+30d`, slug auto; `tenant_subscriptions.status='trialing'` (fix 1a); `tenant_staff_members` admin activo; ≥1 `courts` `online` con pricing; settings de seña según paso 4 (doc7 Flujo 1 Pasos 3-6) | Queries a tenants/tenant_subscriptions/courts | E2E — `onboarding.spec.ts` + FABLE re-verifica la fila de subscription |
| A3 | Slug duplicado | Wizard paso 1 con nombre que colisiona | Auto-sufijo numérico `-2` (doc7 Flujo 1 if/else) | `SELECT slug FROM tenants` | SONNET |
| A4 | Checklist "aha moment" | Wizard sin reservas → reserva online real → `/dashboard` | Ítem "Primera reserva recibida" ⬜→✅ (doc7 Flujo 1 Paso 7) | UI antes/después | E2E — `first-booking-aha.spec.ts` |

## B) Reservas admin (grilla)

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| B1 | Día operativo (`closes_next_day`) en grilla | `/grilla` con tenant `closes_next_day=true`, cierre post-medianoche | Slots madrugada al final (después de 23:00); slot 23:00→00:00 con `time_end='24:00'` y `date`=noche anterior (CLAUDE.md "Día operativo") | Query bookings + orden visual | SONNET ⚠️ (sin spec dedicado) |
| B2 | Reserva manual — guest | `/grilla` → slot libre → modal → nombre/celular → `spontaneous` → confirmar | `bookings`: `status='confirmed'`, `type='spontaneous'`, `created_by_staff` seteado, `player_id IS NULL` (doc7 Flujo 3) | Query booking | E2E — `admin-create-booking-ui.spec.ts` |
| B3 | Reserva para jugador baneado | `/grilla` → buscar jugador con ban → confirmar | Warning NO bloqueante: "suspensión activa / lo baneaste el {fecha}. ¿Crear igual?" — admin decide (doc7 Flujo 3 if/else) | UI + booking se crea si confirma | SONNET ⚠️ |

## C) Reserva online jugador

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| C1 | Con seña — happy path | `/{slug}` → slot → magic link → pagar seña | `pending_payment→confirmed`; `deposit_status 'pending'→'paid'`; `payments` `approved` tipo `deposit`; `cash_flows` income/booking/mercadopago (doc7 Flujo 2) | Queries a bookings/payments/cash_flows | E2E (mock) — `booking-flow.spec.ts` S1 + **FABLE repite contra sandbox REAL (4b)** |
| C2 | Pago rechazado → reintento OK | Ídem, primer pago rechazado | Sigue `pending_payment` + mensaje reintento; tras retry → `confirmed` (doc7 Flujo 2 if/else) | Queries en 2 pasos | E2E S2 + FABLE real (4c con OTHE) |
| C3 | Webhook fuera de banda (polling) | Pago con webhook demorado | UI pasa de "Confirmando..." a confirmado sin reload (doc7 Flujo 2 edge #2) | Observación UI + DB | E2E S3 |
| C4 | Sin seña — confirmación instantánea | Tenant `requires_deposit=false` → reservar | `confirmed` directo, sin `payments`, sin redirect MP (doc7 Flujo 2 sin seña) | Queries | E2E S4 |

## D) Pagos/señas MP

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| D1 | Expiración de `pending_payment` (6 min) | Crear booking con seña y NO pagar → esperar 6 min | `pending_payment→expired`; slot liberado; email `deposit_expired` al jugador; audit `booking.expired` actor system (doc7 Flujo 2 timer) | Query post-6min + slot visible + notifications | **FABLE** (timer real) |
| D2 | Cobro del resto del turno | `/reservas/[id]` → "+ Agregar cobro" → monto/método | `cash_flows` income/booking con `booking_id`, idempotente por clientIdempotencyKey; saldo recalcula (cambio #8; `BookingCharges.tsx`) | Query cash_flows + UI | SONNET ⚠️ |
| D3 | Webhook duplicado (idempotencia) | Reenviar mismo `mp_event_id` 2 veces | 2da llamada ignorada vía `processed_webhooks`; un solo `payments` (doc7 Flujo 2 edge #3) | `count(*) payments` = 1 | **FABLE** (webhook replay) |

## E) Cancelaciones + refunds + no-show

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| E1 | Jugador cancela dentro de plazo | `/mis-reservas` → cancelar (antes del cutoff) | `canceled_refunded`, `canceled_by='player'`; refund MP real; `deposit_status='refunded'`; `payments` tipo `refund` `approved`; email `booking_canceled` (fix 1c) (doc7 4A) | Queries + notifications | E2E + **FABLE real (4d variante)** |
| E2 | Jugador cancela fuera de plazo | Ídem, pasado el cutoff | `canceled_no_refund`; `deposit_status='captured'`; SIN refund MP; cash_flow de seña capturada (doc7 4B) | Queries | SONNET/FABLE ⚠️ (booking backdatado) |
| E3 | Admin cancela "el complejo" | `/reservas/[id]` → cancelar → "El complejo necesita cancelar" | Refund SIEMPRE; `canceled_refunded`, `canceled_by='admin'`; audit con metadata completa; email `booking_canceled_by_complex` (fix 1c) (doc7 4C) | Queries + audit_logs + notifications | E2E — `admin-cancel-mp-refund.spec.ts` + **FABLE real (4d)** |
| E4 | Admin cancela "pidió el jugador" fuera de plazo | Ídem con "El jugador pidió cancelar" | Servidor evalúa política → `canceled_no_refund` + `captured` (doc7 4C Paso 2) | Queries | SONNET ⚠️ |
| E5 | No-show 2da falta en 90 días → softban | "No se presentó" con `noshow_count=1` reciente | `no_show`; seña `captured`; `noshow_count++`; fila en `tenant_player_bans` con `banned_until ≈ +14d` (modelo softban VIGENTE — CLAUDE.md; doc7 4D describe el modelo VIEJO de deuda, NO usar) | Queries a bookings/PTR/bans | **FABLE** (secuencia + time-travel) |

> ⚠️ doc7 Flujo 4D y doc8 US-CAN-004/ABO-005 describen el modelo REVERTIDO de deuda (`balance`). E5 usa el modelo vigente (softban por reincidencia, migr. 044).

## F) Caja + stock + cierre

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| F1 | Movimiento manual de caja | `/caja` → "+ Agregar movimiento" | `cash_flows` fila con `registered_by` (doc7 Flujo 6 Paso 2) | UI + query | E2E — `caja-crud.spec.ts` |
| F2 | Venta de producto (cantina) | `/caja` → venta rápida | `cash_flows` income/`product_sale` + `products.stock` decrementa + alerta low stock (US-CAJ-004) | Query stock antes/después | E2E — `caja-redesign.spec.ts` |
| F3 | Gasto operativo | Movimiento tipo `expense`/`operating_expense` | `cash_flows` expense, resta en balance (migr. 025) | Query | E2E — `caja-redesign.spec.ts` |
| F4 | Cierre de caja diario | `/caja` → "Cerrar caja" → escribir `CERRAR` | `daily_cash_closes` fila única por (tenant,date); cash_flows del día congelados; badge (doc7 Flujo 6 Pasos 3-4) | Query + intentar editar | E2E — `caja-crud.spec.ts` |

## G) Abonados

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| G1 | Crear abonado (8 semanas) | `/abonados` → nuevo → preview sin conflictos | `abonados` `active`; 8 `bookings` `type='fixed'` `confirmed` `deposit not_required` `price_snapshot=price_per_session` (doc7 Flujo 5) | `count(*) = 8` | E2E — `abonados-crud.spec.ts` #1 |
| G2 | Preview con conflicto | Horario que choca con reserva existente | Warning con fechas; semanas en conflicto se SALTAN (doc7 Flujo 5 Paso 3) | count < 8 + fecha ausente | E2E #2 |
| G3 | Pausar/reactivar | Abonado activo → pausar → reactivar | Pausa: `paused` + futuras eliminadas; reactivar: `active` + regenera 8 desde hoy; pasadas intactas (doc7 Flujo 5 edge #3) | Queries antes/después | E2E #4 |

## H) Jugadores / softban

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| H1 | Ban manual desde ficha | `/jugadores/{id}` → "+ Crear Ban" | `tenant_player_bans` fila (`reason`, `banned_until`, `banned_by`); reserva online bloqueada: "No podés reservar en este complejo actualmente"; audit (doc7 5B) | Query + intento de reserva | SONNET ⚠️ (cero e2e) |
| H2 | Levantar ban | Ficha con ban activo → "Levantar Ban" | Ban desactivado (trigger `enforce_single_active_ban` ⚠️ mecanismo exacto a confirmar); reserva vuelve a funcionar; audit | Query + reserva OK | SONNET ⚠️ |

## I) Staff / equipo

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| I1 | Invitar staff | `/staff` → "+ Agregar" → email/nombre/rol | `tenant_staff_members` `is_active=false`, `role` admin\|manager, `added_by`; email de invitación (US-ADM-003) | UI badge pendiente + query | E2E — `staff-crud.spec.ts` #1/#4 |
| I2 | Desactivar único admin | `/staff` → intentar sobre el único admin | Bloqueado: sin dropdown de acciones (US-ADM-003 edge) | UI | E2E #3 |

## J) Settings

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| J1 | Políticas de reserva | `/settings/reservas` → editar seña/anticipación/cancelación → guardar | `tenants.settings` JSONB actualizado; NO retroactivo (US-ADM-002) | Query + reserva nueva usa política nueva | SONNET ⚠️ |
| J2 | Desactivar cancha con reserva futura | `/canchas` → desactivar | Warning explícito; `courts.status='offline'`; slots desaparecen; booking existente se mantiene (US-ADM-001 edge) | Queries | E2E — `canchas-crud.spec.ts` |

## K) Billing SaaS — CERO cobertura e2e, prioridad máxima del ensayo

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| K1 | Trial → suscripción paga | `/settings/facturacion` → "Activar plan" (fix 1b) → checkout preapproval MP sandbox → pagar | `tenant_subscriptions`: `trialing→active`, `plan_id`, `mp_subscription_id`, períodos seteados; `tenants.status→'active'` (doc7 Flujo 7) | Queries + UI banner | **FABLE (4e)** |
| K2 | Dunning día 0 — cobro falla | Webhook `subscription_authorized_payment` rejected (fixture + replay) | `active→past_due`; `payments` rejected; acceso completo 7 días; email al dueño (doc7 Flujo 8 DÍA 0) | Queries + UI | **FABLE (4f)** |
| K3 | Dunning día 7 — suspended | Backdatear `dunning_started_at` -8d → `runDunningSweep()` | `past_due→suspended`; admin SOLO LECTURA (no crear reservas/staff); jugadores intactos (doc7 Flujo 8 DÍA 7) | Query + probar gates UI | **FABLE (4f)** |
| K4 | Dunning día 14 — blocked | Backdatear -15d → sweep | `suspended→blocked`; admin bloqueado total; `/{slug}` público caído ⚠️ (copy exacto a confirmar) (doc7 DÍA 14) | Query + navegación anónima | **FABLE (4f)** |
| K5 | Cancelación voluntaria | `/settings/facturacion` → cancelar → motivo → confirmar | `canceled` + `canceled_at` + razón; MP preapproval cancelado; acceso hasta `current_period_end`; al vencer → abonados `canceled` + futuras eliminadas (doc7 Flujo 9) | Queries + time-travel del período | **FABLE (4f)** |

## L) Notificaciones

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| L1 | Push admin — nueva reserva online | Reserva online confirmada con `/admin/grilla` abierto | Push/toast con payload de la reserva, sonido fijo (doc7 Flujo 2) | Observación browser | E2E — `push.spec.ts` + **FABLE real (4b/4g)** |
| L2 | Horario silencioso (00:00-08:00) | Reserva confirmada en madrugada local | Push agendado con `startAfter`=08:00 local, NO inmediato (`push-quiet-hours.ts`, cambio #7) | Inspección job pg-boss | **FABLE (4g)** |

## M) Portal público / SEO

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| M1 | Sitemap + JSON-LD | `GET /sitemap.xml` + `/{slug}` | XML con tenant; JSON-LD LocalBusiness + BreadcrumbList; OG + canonical (US-ONB-005) | Inspección respuesta | E2E — `public-seo.spec.ts` |
| M2 | Búsqueda por ciudad | `/buscar` → filtrar "Buenos Aires" | Tenant demo en resultados (US-JUG-003) | UI | E2E — `portal-search.spec.ts` |

## N) Vistas jugador

| ID | Acción | Cómo dispararla | Resultado esperado EXACTO | Cómo verificar | Ejecutor |
|---|---|---|---|---|---|
| N1 | Login magic link | Ingresar email → click link (Inbucket local) | Sesión activa; alta de `players` si no existía (US-JUG-001) | Cookie/JWT + query | E2E ⚠️ + FABLE real (4b) |
| N2 | Cancelar desde "Mis turnos" | `/mis-reservas` → cancelar | = E1/E2 según plazo (US-JUG-002) | Query | E2E — `player-bookings.spec.ts` |
| N3 | Exportar datos ARCO | Perfil → "Exportar mis datos" | JSON con profile+bookings+consents (doc18, Ley 25.326) | Inspección archivo | E2E — `player-data-export.spec.ts` |
| N4 | Eliminar cuenta | Perfil → type-to-confirm email | `players.status='anonymized'` (no hard-delete); redirect `/ingresar` | Query + redirect | E2E — `player-delete-account.spec.ts` |

---

## Gaps estructurales detectados al compilar

1. **doc7/doc8 desactualizados** en no-show (modelo deuda revertido → softban) y abonados (crédito eliminado). Ejecutores NO deben leer doc7 4D literal.
2. **Cero cobertura e2e**: grupo K completo (billing SaaS), D1/D3 (timers/idempotencia webhook), H1/H2 (bans), J1, B3, D2, E2/E4 — por eso son FABLE/SONNET manual.
3. `tests/e2e/README.md` menciona `pin-lockout.spec.ts` que no existe (el sistema de PIN se eliminó) — doc obsoleta, no es acción.
4. Email al complejo en cancelaciones: spec lo pide (doc7:570), sin template — gap aceptado, post-launch.

---

## Ledger de resultados

| ID | Estado | Evidencia / notas |
|---|---|---|
| A1 | ⬜ | |
| A2 | ✅ | 2026-07-14 browser real: wizard 4 pasos con e2e-admin-fresh → tenant `ensayo-general-fc` `trialing`, `tenant_subscriptions` `trialing`/predio/monthly, `period_matches_trial=true` (query pegada abajo). Fix 1a validado por el flujo real. |
| A3 | ✅ | 2026-07-14 Sonnet browser real: mismo nombre → slug `ensayo-general-fc-2` auto-sufijado sin error; `tenant_subscriptions` trialing/predio en ambos tenants (fix 1a re-validado). |
| A4 | ⬜ | |
| B1 | ✅ (tras fix ENS-12) | 2026-07-14: orden visual madrugada OK (00:00/01:00 al final, screenshots del agente). Creación manual del slot 23:00→00:00 daba 500 (ENS-12) — FIXEADO y re-ensayado por Fable en browser: reserva "Prueba Medianoche ENS-12" confirmada, DB `time_end='24:00'`, `starts_at/ends_at` físicos correctos (02:00→03:00Z). |
| B2 | ⬜ | |
| B3 | ❌ premisa falsa | 2026-07-14: el modal de reserva manual es guest-only por diseño (sin búsqueda de jugador, sin playerId, sin checkPlayerBanned) — el warning de doc7 Flujo 3 no aplica. LO QUE SÍ FUNCIONA: bloqueo DURO al jugador baneado en autoreserva online, con fecha de fin ("Volvés a poder reservar el 28 jul") y sin fila insertada. Mensaje hardcodeado "por ausencias" ignora el reason real → ENS-10. Divergencia spec→ ENS-9 REQUIERE INPUT. |
| C1 | ✅ REAL | 2026-07-14 sandbox MP real: checkout Pro con tarjeta APRO como invitado → pago 167916656865 approved $4.500 (30% de $15.000 exacto) → webhook firmado → `confirmed`+`paid`+payment approved+email `booking_confirmed` (fix 1c) → pantalla "¡Reserva confirmada!" con QR. Nota: sin fila cash_flows por la seña (ver ENS-21). |
| C2 | ⚠️ parcial | Rechazo OTHE real salteado por costo/beneficio: branch cubierto por e2e S2 (mock) + camino de pago tardío validado REAL. |
| C3 | ✅ REAL | La pantalla "Confirmando tu pago..." flipeó sola a confirmada cuando el webhook llegó fuera de banda (polling real observado). |
| C4 | ⬜ | |
| D1 | ✅ REAL (destapó ENS-16 🔴) | Expiry de 6 min real observado (booking 830dd029 17:18→17:24 `expired`, slot liberado, `deposit_expired` encolado). PERO el jugador HABÍA PAGADO: ver ENS-16. |
| D2 | ✅ | 2026-07-14 Sonnet browser real: 2 cobros parciales OK (cash_flows income/booking, saldo recalcula, prefill=pendiente). Sobre-cobro ENS-3 confirmado: $500 sobre pendiente de $30 aceptado sin warning ($570 pagado en turno de $100, UI dice "Pagado completo"). Nuevo ENS-11: banner push sin descarte tapa "Registrar cobro". |
| D3 | ✅ REAL | Mismo `mp_event_id` enviado 2 veces (firmado HMAC real) → 1 sola fila en processed_webhooks, 1 solo efecto. Idempotencia perfecta. |
| E1 | ⬜ | |
| E2 | ✅ | 2026-07-14 Sonnet browser real: `canceled_no_refund` + `captured` + `canceled_by='player'`, sin refund, notification `booking_canceled` encolada, audit `inPolicy:false`. Hallazgos: BUG-1 contador "turnos por jugar" no filtra canceladas (mis-reservas/page.tsx:43); BUG-2 (REQUIERE INPUT UX) modal no avisa que ESTE turno pierde la seña. |
| E3 | ✅ REAL (refund bloqueado por sandbox) | Admin canceló "el complejo" en browser real: `canceled_refunded`+`deposit refunded`+`canceled_by admin`+razón prefijada+email `booking_canceled_by_complex` (fix 1c). El `createRefund` real contra MP devolvió 401 "Unauthorized use of live credentials" — LIMITACIÓN del sandbox (refunds no disponibles entre test users), NO bug: la fila refund quedó `pending` durable como diseña caza-bugs #3. Ver ENS-19. Smoke de refund real queda para el checklist de prod. |
| E4 | ✅ | 2026-07-14 Sonnet browser real: servidor evaluó política → `canceled_no_refund` + `captured`, audit metadata exacta ({inPolicy:false, shouldRefund:false, cancellationType:'jugador'}), notification template `booking_canceled` (no _by_complex), razón prefijada OK. |
| E5 | ⬜ | |
| F1 | ⬜ | |
| F2 | ⬜ | |
| F3 | ⬜ | |
| F4 | ⬜ | |
| G1 | ⬜ | |
| G2 | ⬜ | |
| G3 | ⬜ | |
| H1 | ❌ premisa falsa | 2026-07-14: NO existe UI ni action de "Crear Ban" manual — único writer de `tenant_player_bans` es `applyNoShowStrike` (softban automático). La ficha solo MUESTRA el ban (verificado: renderiza bien con fila insertada por SQL). doc7 5B promete ban manual → ENS-8 REQUIERE INPUT. |
| H2 | ❌ premisa falsa | Ídem: no existe "Levantar Ban"; el ban expira solo por `banned_until` (checkPlayerBanned filtra por fecha). ENS-8. |
| I1 | ⬜ | |
| I2 | ⬜ | |
| J1 | ⚠️ parcial | 2026-07-14: propagación técnica verificada (booking_advance_days 6→2 por SQL → datepicker público ofrece solo 2 días, sin caché stale; restaurado a 6). PERO `/settings/reservas` no expone ese campo (solo super-admin) → ENS-14 REQUIERE INPUT. |
| J2 | ⬜ | |
| K1 | ✅ REAL COMPLETO | 2026-07-14: "Activar plan" → preapproval REAL en MP sandbox → checkout de suscripción → tarjeta APRO → "¡Listo! Ya te suscribiste a TurnoGol — Predio (mensual)" (operación 167921223525, $55.000 approved) → webhook `subscription_authorized_payment` → `trialing→active` en tenant Y sub + `last_payment_at` + email `subscription_activated`. DESTAPÓ ENS-22 (gateway master roto) que se fixeó en el medio. Nota: el cobro no deja fila en `payments` (solo last_payment_at) — trazabilidad a revisar. |
| K2 | ⚠️ pendiente | Requiere webhook `subscription_authorized_payment` rejected con pago real — depende de completar K1 (preapproval pagado). |
| K3 | ✅ REAL (transiciones) | Time-travel: `dunning_started_at` -8d + `runDunningSweep()` real → `past_due→suspended` (tenant Y sub). GATE DE UI ROTO: ver ENS-20. |
| K4 | ✅ REAL | -15d → `blocked`; -91d → `churned` + `scheduled_deletion_at`=+7d exacto. Página pública del tenant caído muestra "Este complejo no está disponible temporalmente" (copy de doc7 DÍA 14 CONFIRMADO). Gate de admin: ENS-20 🔴. |
| K5 | ⬜ | |
| L1 | ⬜ | |
| L2 | ⬜ | |
| M1 | ⬜ | |
| M2 | ⬜ | |
| N1 | ✅ | 2026-07-14 flujo completo real: /ingresar → email en Inbucket → link con token_hash → /verify success → sesión activa, navbar "Cuenta de E2E". |
| N2 | ⬜ | |
| N3 | ⬜ | |
| N4 | ⬜ | |

## Triage de hallazgos del ensayo (se van sumando)

| # | Sev | Hallazgo | Ubicación | Estado |
|---|---|---|---|---|
| ENS-1 | 🟡 | Contador "Tenés N turnos por jugar" cuenta canceladas (filtra solo por fecha, no status) | `src/app/(player)/mis-reservas/page.tsx:43` | pendiente fix |
| ENS-2 | 🟡 | Modal de cancelación (jugador y admin) explica la política en abstracto pero no dice si ESTE turno pierde la seña, teniendo el server toda la info | `CancelBookingButton.tsx:64` + modal admin | REQUIERE INPUT (diseño) |
| ENS-3 | 🟡 | `addBookingChargeAction` sin validación de monto máximo vs saldo pendiente — sobre-cobro CONFIRMADO EN VIVO: turno de $100 aceptó cobros por $570 y la UI muestra "Pagado completo" (screenshot 2026-07-14) | `src/app/(admin)/reservas/actions.ts:343-410`, `BookingCharges.tsx:167` | pendiente fix |
| ENS-4 | ~~🟢~~ RETIRADO | Navbar "Ingresar" con sesión activa era artefacto del workaround de sesión inyectada del agente; con magic link real muestra "Cuenta de E2E" correcto | — | cerrado, no es bug |
| ENS-11 | 🟡 | Banner "¿Habilitar notificaciones?" (fixed bottom-4 left-4) SIN botón de descarte se superpone a "Registrar cobro" e intercepta clicks reales (verificado con elementFromPoint) — bloquea cobrar hasta aceptar/rechazar push | `PushNotificationManager.tsx` (banner) | pendiente fix |
| ENS-5 | 🟢 gotcha entorno | Dev server (Turbopack) colgado sirviendo 404 en rutas dinámicas tras cambios en caliente; reinicio lo resolvió. CERRADO con doble verificación autenticada post-restart: `/jugadores/[playerId]` y `/reservas/[id]` renderizan perfecto con datos del propio tenant; el 404 residual era booking de OTRO tenant = RLS correcto. 2 agentes lo reportaron como 🔴 por correr contra el proceso viejo. | entorno local | resuelto, capturar como conocimiento |
| ENS-8 | 🟡 REQUIERE INPUT | Ban manual del complejo (crear/levantar desde ficha de jugador) NO existe en el producto; doc7 Flujo 5B y CLAUDE.md lo mencionan. ¿Scope v1 (implementar) o post-launch (actualizar docs)? | `JugadorProfileView.tsx` (solo display), `ptr.service.ts:68` único writer | decisión de Lazar |
| ENS-9 | 🟡 REQUIERE INPUT | Modal de reserva manual sin búsqueda/vínculo de jugador registrado (guest-only) → sin warning de ban (doc7 Flujo 3). Consistente con "sin burocracia", pero divergente de spec. ¿Aceptado para v1? | `BookingFormModal.tsx:38-59` | decisión de Lazar |
| ENS-10 | 🟢 | Mensaje de bloqueo al jugador baneado hardcodea "por ausencias" e ignora el `reason` real del ban | `CheckoutStates.tsx:51-58` | pendiente triage |
| ENS-12 | 🔴→✅ FIXEADO | Reserva manual en slot 23:00→00:00 daba 500: modal con copia local de `minsToTime` (%24 → "00:00") + schema Zod que rechazaba "24:00". Afectaba a TODO tenant con horario default (cierre 00:00). Fix: `endLabelFromMins` en el modal + `hhmmEnd` en schema + guard de bloques 120' cruzando medianoche. TDD (3 tests nuevos), unit 1539/1539, re-ensayado en browser con evidencia DB. Barrido de clase: otras copias de `%24` son solo para INICIO (correctas); flujo online ya usaba el helper. | `BookingFormModal.tsx`, `booking.schema.ts` | cerrado 2026-07-14 |
| ENS-13 | 🟡 | Abonados NO pueden ocupar el último turno del día (23:00→medianoche): `<input type="time">` no produce "24:00" y la validación rechaza "00:00" como fin. Limitación funcional silenciosa, misma clase que ENS-12 pero sin crash. | `abonados/nuevo/AbonadoForm.tsx:224`, `nuevo/actions.ts:25-43` | pendiente triage (¿selector de slots?) |
| ENS-14 | 🟡 REQUIERE INPUT | `booking_advance_days` no es self-service (solo editable por super-admin); doc8 US-ADM-002 tampoco lo incluye, probablemente intencional — confirmar. | `ReservasPolicyForm.tsx:39-53` | decisión de Lazar |
| ENS-15 | 🟡 | Reserva confirmada por RECONCILIACIÓN (webhook perdido) no envía push al admin — el camino webhook sí (`notifyAdminPush` solo en mp-webhook.handler). | `reconcile-pending-payments.worker.ts` | pendiente fix |
| ENS-16 | 🔴 | **Jugador paga y pierde el turno igual**: carrera expiry (6 min) vs reconciliación (cada 5 min, umbral >5 min) deja UNA ventana de 60s en 300s — probado REAL: pago 167914484787 approved $4.500 y booking `expired` a los 6:02; la reconciliación del minuto 7 ya no lo mira (solo `pending_payment`) → **pago aprobado huérfano para siempre**: sin refund, sin alerta, y el email dice "expiró porque no se completó el pago" (falso). Mitigación parcial verificada: SI el webhook llega tarde → `admin_late_payment` ✅. Fix recomendado: (a) `expirePendingBookingWithPolicy` consulta MP antes de expirar un booking con preference; (b) reconciliación post-terminal (expired últimas 24h con payment pending) → alerta/refund. | `booking.expiry.ts:85-157`, `reconcile-pending-payments.worker.ts:39-45` | REQUIERE INPUT (diseño de dinero) + fix pre-launch |
| ENS-17 | 🟡 DX | `pnpm jobs:start` local corre SIN env (tsx no carga .env.local): webhooks fallan con ENCRYPTION_KEY/Resend inválidos. En Railway no aplica (env por dashboard). Fix sugerido: `tsx --env-file=.env.local` en el script o dotenv/config en run-workers. Bonus Windows: TaskStop no mata el árbol → workers zombies compitiendo por jobs (3 zombies encontrados y matados con taskkill /T). | `package.json:65`, `run-workers.ts` | pendiente fix DX |
| ENS-18 | 🟢 | Error repetido en dev server: `TypeError: controller[kState].transformAlgorithm is not a function` (digest 824594213) — ruido de instrumentación (Sentry/undici/Node 24?), no bloquea flujos pero ensucia logs. Investigar post-ensayo. | logs `next dev` | pendiente triage |
| ENS-19 | 🟡 | Refund que falla contra MP queda `payments.status='pending'` PARA SIEMPRE: no hay worker de retry ni alerta (el catch solo va a Sentry). Runbook: query semanal de refunds pending. Sandbox además NO permite refunds entre test users (401 live credentials) → smoke de refund real va al checklist de prod. | `payment.service.ts settleRefund` + workers | REQUIERE INPUT (retry vs manual) |
| ENS-20 | 🔴 | **Dueño moroso no puede pagar para recuperarse**: `resolveStaffTenants` excluye tenants `suspended/blocked/churned/deleted` del login → el owner rebota al login SIN mensaje (probado real: password grant 200 pero la app lo expulsa). doc7 pedía suspended=solo lectura y blocked=pantalla de pago. El recovery del dunning es inaccesible por UI → churn garantizado post-suspensión. | `auth.service.ts:136` | REQUIERE INPUT + fix pre-launch |
| ENS-21 | 🟡 verificar | Seña MP confirmada NO crea fila en `cash_flows` (la matriz/doc7 esperaba income/booking/mercadopago). El detalle de reserva SÍ la muestra como cobro. ¿Diseño (la plata va a la cuenta MP del complejo, no a la caja física) o gap? Verificar contra doc7 Flujo 2/6 y decidir. | `payment.service.ts handleApproved` | REQUIERE INPUT |
| ENS-22 | 🔴→✅ FIXEADO | **Billing SaaS roto de raíz**: `getBillingGateway` pasaba el token master PLAINTEXT del env a `MercadoPagoGateway`, cuyo constructor siempre desencripta (pensado para tokens de tenant cifrados en DB) → 500 "Invalid ciphertext format" en TODO el billing contra MP real. Invisible para la suite (tests usan MockGateway) — el bug existía desde siempre; el endpoint era además inalcanzable (P0 original). Fix TDD: `mpClientFromPlaintext` + flag `plaintextToken` + 3 tests (14/14 verde, typecheck/lint OK). Verificado en vivo: K1 completo post-fix. | `billing.gateway.ts:21`, `mercadopago.ts`, `mp-gateway.implementation.ts:68` | cerrado 2026-07-14 |
| ENS-23 | 🟡 checklist prod | MP rechaza preapproval si `payer_email` no tiene cuenta MP ("Both payer and collector must be real or test users") — en sandbox se resolvió con email de test user. EN PROD: verificar en el primer subscribe real qué pasa si el dueño usa un email sin cuenta de MP; puede requerir capturar el error con mensaje claro ("necesitás una cuenta de MercadoPago"). | `billing.service.ts subscribe (payerEmail)` | smoke primer subscribe prod |
| ENS-24 | 🟢 | Cobro SaaS aprobado no deja fila en `payments` (solo `last_payment_at`); los rechazos sí insertarían. Sin registro local del histórico de cobros de suscripción — MRR/auditoría dependen de MP. | `dunning.service.ts onPaymentApproved` | pendiente triage |
| ENS-25 | 🔴 legal | La cancelación voluntaria de suscripción NO tiene botón en la UI (`/api/billing/cancel` funciona, probado real en K5, pero nadie lo llama). Res. 424/2020: la baja debe ser tan fácil como el alta. | `settings/facturacion/page.tsx` | ✅ FIXEADO (W8): `CancelSubscriptionSection.tsx` con confirmación de consecuencias, llama `/api/billing/cancel`; 10 unit tests |
| ENS-26 | 🟡 | Cancelar la suscripción expulsa al dueño AL INSTANTE pese a `accessUntil`=fin de período pagado (probado: canceló hoy con acceso hasta 13/9 → "Cuenta suspendida" inmediato). Backend correcto (`period_end intact` + sweep canceled→blocked al vencer); bug = `'canceled'` en el hard-lock del layout. | `(admin)/layout.tsx:63` | ✅ FIXEADO (W8): `'canceled'` fuera del hard-lock (sweep canceled→blocked corta al vencer) + banner ámbar "acceso hasta X" con link a `/reactivar`; 6 unit tests del hard-lock |
| ENS-27 | 🔴 legal | **Eliminar cuenta (ARCO, Ley 25.326) falla en silencio** si el jugador tiene UN booking terminal: `anonymizePlayer` hace UPDATE de bookings sin filtrar status y el trigger `enforce_booking_invariants_fn` (migr. 030) aborta la transacción entera. PREEXISTENTE en main (no de esta tanda) — destapado por el e2e `player-delete-account.spec` en el gate del release verifier. | `player.anonymization.ts:76`, `migrations/030:26-47` | M8 en curso: migración nueva con excepción quirúrgica en el trigger (solo `player_id`→NULL, nada más cambia) — filtrar terminales en código dejaría historial sin anonimizar (violaría ARCO) |
| ENS-6 | 🟡 proceso | Los tests de integración comparten la DB local (54322) con el entorno de ensayo: sus cleanups borraron el seed e2e a mitad del fan-out. Regla: no correr integration durante fases de browser, re-seed antes de cada fase. | proceso del ensayo | regla adoptada |
| ENS-7 | 🟢 | Worker send-email en local falla con "Missing API key" de Resend (el proceso standalone no carga .env.local igual que Next). Verificación de emails en local = filas en `notifications` + payload; envío real queda para staging. | run-workers env loading | aceptado para el ensayo, revisar para prod (Railway usa dashboard env, no .env) |

## Evidencia

### A2 (2026-07-14)
```json
[{ "slug": "ensayo-general-fc", "tenant_status": "trialing", "trial_ends_at": "2026-08-13T15:17:19.411Z",
   "sub_status": "trialing", "plan": "predio", "billing_cycle": "monthly",
   "current_period_end": "2026-08-13T15:17:19.411Z", "period_matches_trial": true }]
```
Juez del fix 1a/1b/1c: typecheck ✅, lint 0 errores ✅, unit 16/16 ✅, integration 61/61 ✅ (tenant-subscription-creation, cancellations, mp-webhook, billing).

### K2 — Cobro de suscripción RECHAZADO (2026-07-14 17:10) ✅ REAL COMPLETO

Pago rechazado REAL contra la cuenta master (preference con `external_reference`=tenantId, tarjeta OTHE, operación **168803296210** "Tu tarjeta rechazó el pago") → webhook `subscription_authorized_payment` firmado → el worker consultó a MP de verdad → `onPaymentRejected`: **`active→past_due` en tenant Y suscripción**, `dunning_started_at`+`last_payment_failed_at` seteados, email `dunning_payment_failed` encolado al dueño. BONUS verificado en browser: el dueño `past_due` sigue operando el panel completo con banner "Tu pago falló. Regularizá antes del 13 de septiembre." + botón "Actualizar pago"→`/reactivar` (fix ENS-20 de W2, vivo).

### K5 — Cancelación voluntaria (2026-07-14 17:12) ✅ REAL COMPLETO + 2 hallazgos

`POST /api/billing/cancel` (sesión admin real) → `cancelPreapproval` contra MP REAL: preapproval `e00ea2c8…` verificado **`cancelled` en la API de MP** + local `canceled` con `canceled_at`, `cancellation_reason` y `accessUntil`=`current_period_end` (13/9 — cancelás pero usás lo que pagaste). Hallazgos: **ENS-25** (no hay botón de baja en la UI — el endpoint no lo llama nadie; obligación legal Res. 424/2020) y **ENS-26** (tras cancelar, lockout INMEDIATO a "Cuenta suspendida" pese al acceso pagado hasta el 13/9 — el backend diseña bien `period_end intact` + sweep `canceled→blocked` al vencer; el bug es solo `'canceled'` en el hard-lock del layout). Ambos a W8.

### 4g — Push al admin + quiet hours (2026-07-14 16:25) ✅ circuito completo / visual pendiente de smoke

- Circuito REAL verificado por dentro: `POST /api/admin/push/subscribe` con suscripción de prueba → fila real bajo RLS (`subscriptionId e7fa013b…`) → `POST /api/admin/push/test` → `{dispatched: 1}` → job `push-send` en pgboss → el worker lo levantó y llamó a web-push DE VERDAD: falló exactamente en la validación criptográfica ("Public key is not valid for specified curve", la key de prueba no es un punto P-256 válido) y quedó en `retry` — o sea auth+RLS+cola+worker+retry policy funcionan; lo único fake era la clave. Limpieza hecha (sub borrada, job cancelado).
- Quiet hours (cambio #7): 8/8 tests unit verdes (`push-quiet-hours.test.ts`) — madrugada 00:00-08:00 en timezone del complejo agenda el push vía `startAfter` a las 08:00 locales.
- Push VISUAL: imposible en el browser embebido del ensayo (permiso de notificaciones `denied` a nivel navegador, sin UI para concederlo). **Smoke de 2 clicks para Lazar en su Chrome**: abrir `localhost:3000/dashboard` logueado como admin → "Habilitar notificaciones" → aceptar el permiso → crear una reserva online de prueba (o `fetch('/api/admin/push/test', {method:'POST'})` en la consola) → debe sonar la notificación.

## Decisiones estratégicas (2026-07-14 — Lazar delegó el criterio: "decidí vos todo, arreglá y solucioná con criterio")

Todas las decisiones REQUIERE INPUT pendientes quedan resueltas así. Criterio aplicado: estándar de plataformas de reservas+pagos (nunca cerrar el camino del pago, decir consecuencias concretas antes de acciones irreversibles, dinero siempre trazable, mínima fricción operativa v1).

| ENS | Decisión | Fundamento |
|---|---|---|
| ENS-1 | FIX: contador solo `confirmed`+`pending_payment` futuras | Contar canceladas miente al jugador |
| ENS-2 | FIX: modal de cancelar dice la consecuencia CONCRETA (devuelve/pierde seña de $X) usando la política real server-side | Estándar de industria pre-acción irreversible; el server ya tiene la info |
| ENS-3 | FIX: rechazar cobro > pendiente con mensaje claro; UI muestra el máximo | Protege al empleado de errores de tipeo; sobre-cobro real no existe en este negocio |
| ENS-8 | FIX v1 mínimo: botón Bloquear/Levantar bloqueo en ficha de jugador (motivo + duración), guard operator | El complejo necesita bloquear a un conflictivo sin esperar 2 no-shows; tabla y gate ya existen, solo falta el writer+UI |
| ENS-9 | DIFERIDO: reserva manual sigue guest-only | Velocidad en mostrador > burocracia (ventaja vs ATC); el ban duro ya gatea la autoreserva online que es donde importa. Actualizar doc7 Flujo 3 como divergencia aceptada |
| ENS-10 | FIX: mostrar `reason` real del ban con fallback genérico | Trivial, coherente con ENS-8 |
| ENS-11 | FIX: botón de descarte + localStorage 7 días + unmount real | Un banner nunca puede bloquear cobrar |
| ENS-13 | FIX: aceptar 00:00 como fin de sesión de abonado normalizando a 24:00 (misma clase ENS-12) | Paridad con reservas comunes |
| ENS-14 | DIFERIDO: `booking_advance_days` queda super-admin only (default 6 como ATC) | Exponerlo agrega confusión sin demanda comprobada; doc8 US-ADM-002 tampoco lo pide |
| ENS-15 | FIX: reconciliación también manda push al admin | El origen del aviso no debe depender del camino técnico |
| ENS-16 | FIX pre-launch (a) antes de expirar, preguntar a MP si el pago entró → confirmar en vez de expirar; (b) rescate post-expiración: sweep de expiradas <24h con pago aprobado huérfano → alerta admin_late_payment (reusa flujo probado en vivo) | Dinero del jugador NUNCA queda huérfano en silencio. Si MP no responde, expira igual y el rescate (b) cubre — un MP caído no puede dejar slots secuestrados |
| ENS-17 | FIX DX: run-workers carga .env.local en dev (`process.loadEnvFile`, try/catch, no pisa env existente) | Elimina la clase de "workers arrancan sin claves" en local; Railway no se toca |
| ENS-19 | FIX: worker horario de retry de refunds `pending` (idempotency key) + si >24h sigue fallando, alerta única al dueño "resolvelo manual en MP" | Un reembolso prometido al jugador no puede depender de una query semanal de runbook |
| ENS-20 | FIX pre-launch: login deja pasar morosos (solo `deleted` afuera); `suspended` se suma al hard-lock del panel; `/suspended` gana botón "Soy el dueño — regularizar pago" → página nueva `/reactivar` (solo owner, muestra estado+deuda+botón de pago); pago aprobado reactiva y limpia dunning/deletion; `past_due` mantiene panel completo + banner amarillo | Regla #1 de SaaS: NUNCA cerrarle la puerta al que quiere pagarte. past_due (día 0-7) opera normal con presión suave; suspended+ = pantalla de pago |
| ENS-21 | FIX: seña MP confirmada crea cash_flow income/booking method='mercadopago' en la misma tx | El modelo YA contempla método mercadopago y el cierre desglosa byMethod — era gap, no diseño. La caja del día tiene que ver TODA la plata |
| ENS-23 | FIX chico: subscribe captura el rechazo de MP por payer sin cuenta → mensaje claro "necesitás una cuenta de MercadoPago con este email" | Primer subscribe real de un cliente no puede morir en un 500 críptico |
| ENS-24 | DIFERIDO: histórico de cobros SaaS queda en MP (fuente de verdad) + `last_payment_at` + processed_webhooks | Bajo valor pre-launch vs riesgo de tocar el schema de payments; se revisa cuando haya MRR real que auditar |
| ENS-18 | DIFERIDO: ruido de instrumentación en logs dev | No bloquea flujos |
| R5-input-1 | DECIDIDO (M7): `staff/actions.ts` se alinea con la fuente única — `canceled` SÍ gestiona equipo hasta `period_end` | Coherencia con ENS-26: pagó su período, opera completo. La 3ra copia local de la lista de estados era divergencia silenciosa |
| R5-input-2 | DECIDIDO (M7): el dueño `suspended` accede a la baja desde `/reactivar` (sección de cancelación reutilizando CancelSubscriptionSection); el hard-lock del panel queda intacto | Res. 424/2020 + criterio ya sentado en ENS-25: la baja tan fácil como el alta. `/reactivar` es la única superficie que un suspended ve — ahí van las dos salidas (pagar o irse) |

## Resultado de la tanda de fixes (2026-07-14, tarde)

Tanda de 7 implementadores Sonnet con contrato + TDD. Estado tras reconciliación e integración:

- ✅ **W1** (ENS-16 + ENS-15): pre-check a MP antes de expirar (`ExpiryAction` gana `'confirmed'`), rescate post-terminal en el reconcile worker (expiradas <24h con pago huérfano), push del admin unificado en `notifyAdminBookingConfirmed` (push.service) para webhook+reconcile+pre-check. 13 tests nuevos, TDD con rojo verificado.
- ✅ **W2** (ENS-20): login deja pasar morosos (solo `deleted` afuera), `suspended` al hard-lock del panel, `/suspended` con botón → página nueva `/reactivar` (solo owner), `reactivate()` ampliado a suspended/blocked (past_due excluido a propósito: preapproval de MP sigue reintentando — evita doble cobro), `canceled` recuperable vía `onPaymentApproved`. Sin triggers DB que bloqueen transiciones (verificado en migraciones). 6 archivos de test nuevos.
- ✅ **W3** (ENS-3 + ENS-21): cobro > pendiente rechazado server-side (idempotencia de reintento preservada), seña MP crea cash_flow income/booking/mercadopago en la misma tx (`recordDepositCashFlow`), sin doble conteo en el pendiente (exclusión por descripción determinística), degradación elegante con caja cerrada o sin admin activo. 18 tests.
- ✅ **W4** (ENS-1 + ENS-2 + ENS-10): contador solo confirmadas/pendientes futuras, modales de cancelar (jugador Y admin) muestran consecuencia concreta reusando `decideAdminRefund` (cero umbrales inventados), reason real del ban propagado hasta el banner público. 30 tests.
- ✅ **W5** (ENS-11 + ENS-17): banner push con descarte (localStorage 7 días, unmount real), `run-workers` carga `.env.local` en dev (verificación causal: sin fix claves vacías, con fix 64/36 chars). 11 tests.
- ✅ **W6** (ENS-8): ban manual completo — `banPlayerManually`/`liftPlayerBan` (levantar = `banned_until=NOW()`, preserva historial), Server Actions con guard operator + rate-limit + audit, UI en ficha con motivo + duración 7/30/indefinido. Trigger `enforce_single_active_ban` respetado (re-ban actualiza con FOR UPDATE). 16 tests.
- ⏳ **W7** (ENS-13 + ENS-19 + ENS-23): en curso.

**Incidente operativo grave (2026-07-14 ~16:00)**: la otra sesión de Claude de Lazar commiteó `5cf0e75 fix(e2e)` y stasheó el working tree a mitad de la tanda (`stash@{0}`), barriendo los fixes previos del ensayo (P0 billing, ENS-12, ENS-22, fix 1c, "Sin plan elegido"). Uno de los agentes (W5) además hizo stash/pop propios. Recuperación: triple respaldo en scratchpad (patch del stash + diff del working dir + untracked), restauración directa de 15 archivos desde `stash@{0}`, merge manual de 3 (payment.service.ts fix 1c, billing.service.ts listActivePlans, reservas/actions.ts dispatch de emails), y ajuste de `push-notification-timeout.test.tsx` (asumía un solo botón en el banner, ENS-11 agregó "Cerrar"). `stash@{0}` NO se dropea hasta el cierre. Regla nueva para contratos: git mutante PROHIBIDO explícito.

**Gate integrado post-reconciliación (2026-07-14 16:19)**: `pnpm typecheck` ✅ limpio · `pnpm lint` ✅ 0 errores (28 warnings preexistentes) · `pnpm test` ✅ **1643/1643**. Pendiente: juez de W7, review adversarial fresco de toda la tanda, integration+isolation al cierre (no se corren ahora por ENS-6: DB compartida con el ensayo vivo).

## Ledger de delegaciones (protocolo)

| Agente | Finalidad | Costo aprox | Resultado |
|---|---|---|---|
| Explore ×3 (Sonnet) | Assessment: billing lifecycle / flujos dinero+push / launch-readiness | ~350k tokens | P0 tenant_subscriptions + 8 gaps billing + 8 gaps reservas + mapa infra |
| Explore (Sonnet) | Compilar esta matriz desde doc7/doc8/e2e | ~165k tokens | 45 acciones, 4 gaps estructurales |
| sonnet-adversarial-reviewer | Verificación fresca del fix P0 (1a/1b/1c) | ~200k tokens | APROBADO CON RESERVAS: 2 🟡 fixeados el mismo día (dispatchEmail sin try/catch en 2 Server Actions → falso error post-cancelación; loadCancelEmailNames silencioso sin PTR → captureMessage agregado), 1 🟢 nit (formatDateArs duplicado, aceptado), RLS/tx/fechas/dedup/jsonb verificados contra Postgres real con rol turnogol_app. Suite completa: unit 1536/1536, isolation 111/111. 2 REQUIERE INPUT: backfill de subs pre-fix (prod vacío) y label "Predio" durante trial. |
| sonnet-implementer W1 | ENS-16 + ENS-15 (pre-check MP en expiry + rescate post-terminal + push en reconcile) | ~263k tokens | ✅ verde, 13 tests nuevos; sobrevivió al incidente git reconstruyendo desde su registro |
| sonnet-implementer W2 | ENS-20 (login morosos + /reactivar + recovery de dunning) | ~336k tokens | ✅ verde, 93 tests corridos; decisión fina: past_due sin segundo preapproval (evita doble cobro) |
| sonnet-implementer W3 | ENS-3 + ENS-21 (límite de cobro + cash_flow de seña MP) | ~292k tokens | ✅ verde, 97 tests corridos; edge cases de caja cerrada/sin admin resueltos con degradación elegante |
| sonnet-implementer W4 | ENS-1 + ENS-2 + ENS-10 (contador + consecuencia de cancelar + reason del ban) | ~292k tokens | ✅ verde, 30 tests |
| sonnet-implementer W5 | ENS-11 + ENS-17 (banner descartable + env de workers) | ~191k tokens | ✅ verde, 11 tests + smoke causal de jobs:start; hizo stash/pop propios (contribuyó al incidente git) |
| sonnet-implementer W6 | ENS-8 (ban manual del complejo) | ~202k tokens | ✅ verde, 16 tests; levantar ban = banned_until=NOW() preservando historial |
| sonnet-implementer W7 | ENS-13 + ENS-19 + ENS-23 (abonados medianoche + retry refunds + payer sin cuenta MP) | ~332k tokens | ✅ verde 1671/1671 + build; HALLAZGO EXTRA: exportar Zod schema desde archivo 'use server' rompe `pnpm build` (typecheck/lint/test verdes con el bug adentro) — corregido; gotcha: `dlq.ts ALL_QUEUES` se mantiene a mano por worker nuevo |
| sonnet-implementer W8 | ENS-25 (botón de baja legal) + ENS-26 (acceso hasta period_end tras cancelar) | ~? (murió por session limit sin reporte) | ✅ verificado por el orquestador sobre el CÓDIGO (no el mensaje): `CancelSubscriptionSection.tsx` + `'canceled'` fuera del hard-lock + banner ámbar con "Reactivar" + tests 20/20 verdes (cancel-subscription-section 10, facturacion-page 4 — ya no flakea —, admin-layout-hard-lock 6) |
| Fable (orquestador) | Reconciliación del stash@{0} post-incidente | inline | ✅ 15 archivos restaurados + 3 merges manuales + 1 test ajustado; gate integrado verde (typecheck/lint/unit 1643) |
| sonnet-adversarial-reviewer R1 (dinero) | Atacar ENS-16/15/3/21/19 | ~177k tokens | **RECHAZADO ENS-16** + reservas: 🔴 A (error local post-aprobación de MP expira reserva PAGADA; la red de rescate comparte el punto de falla), 🟡 B (push "confirmada" falso en rescate post-terminal — won siempre false — y duplicado en carreras), 🟡 C (TOCTOU: 2 cobros concurrentes superan el pendiente), 🟢 D (filtro por description colisionable — aceptado), 🟢 E (refund huérfano sin alerta). Resistió: doble movimiento de dinero, pools RLS, idempotency del retry, TZ, jsonb. → M1/M2 |
| sonnet-adversarial-reviewer R3 (UI/seguridad) | Atacar ENS-1/2/8/10/11/13 | ~182k tokens | APROBADO CON RESERVAS: 🟡 reason del ban fabricable por URL + privacidad (→M3), 🟡 preview admin miente en closes_next_day madrugada (→M3), 🟡 banner push con reloj corrido oculto para siempre (→M3), 🟡 preview jugador stale (aceptado como límite v1), 🟡 DISMISS_KEY global entre tenants (aceptado v1), 🟡 ban manual sin test de integración real (→M2). Resistió: XSS, aislamiento cross-tenant de bans, borde NOW() del lift, '24:00' en consumidores |
| sonnet-implementer M1 (1er intento) | Fix R1-A/B/E (pago aprobado jamás expira + confirmed=won + alerta refund huérfano) | ~0 (murió por session limit al arrancar) | ❌ sin edits — relanzado |
| sonnet-implementer M2 | Fix R1-C (FOR UPDATE en cobros) + tests integración bans/cobro concurrente (sin ejecutar) | ~? (murió por session limit) | ✅ PARCIAL verificado sobre el código: FOR UPDATE antes de getBookingCharges con nota de orden de locks + 2 unit tests del orden + test integración ENS-21f (seña MP excluida de cobros de mostrador). FALTARON los tests de integración de concurrencia y ban manual → M2b |
| sonnet-implementer M3 (1er intento) | Fix R3 (reason desde DB, preview admin con starts_at físico, banner clock) | ~0 (murió por session limit explorando) | ❌ sin edits — relanzado |
| sonnet-implementer M1 (relanzado) | Ídem M1: R1-A (separar search/process, 'rescheduled' si MP dijo approved y lo local falla, recordDepositCashFlow catch-all), R1-B (confirmed=won, push solo con won), R1-E (refund huérfano alerta) | ~204k tokens | ✅ verde 1712/1712 unit + build; `ReconcileProcessingError` (search se propaga, process se envuelve) → expiry devuelve 'rescheduled'+retry 120s, JAMÁS expira con approved; `confirmed` deriva SOLO de `won===true` (destapó que `WebhookOutcome.result` nunca reflejó `won` pese al comentario que lo prometía — campo `won?` aditivo en payment.types); refund huérfano alerta con mismo umbral/dedupe. HALLAZGO DE CLASE: mp-webhook.handler + loop principal del reconcile worker gatean push sin won → extensión M1b |
| sonnet-implementer M1b (extensión) | Cerrar la CLASE de R1-B: gate `won===true` en mp-webhook.handler + loop principal reconcilePendingPayments + barrido de todo consumidor de dispatchPaymentInfo | ~246k tokens (acumulado M1+M1b) | ✅ verde 1715/1715 unit + build; barrido de clase: 6 sitios — webhook handler y loop principal FIXEADOS, rescate post-terminal y expiry precheck YA CORRECTOS (vía reconcileApprovedPaymentForBooking), processWebhook y dunning NO APLICAN. Lateral: `processWebhook` (payment.service) es dead code sin callers en src/ — REQUIERE INPUT antes de borrar |
| sonnet-implementer M3 (relanzado) | Ídem M3: reason desde DB (getActiveBanReason), preview admin con starts_at físico, banner clock skew | ~181k tokens | ✅ verde 1712/1712 unit + build; `getActiveBanReason` como wrapper de `checkPlayerBanned` (una sola fuente de vigencia, cubre ban global) leído bajo `withPlayerContext` (policy `player_own_bans_select` deja al jugador ver SU fila sin tenant context — análisis de 006_rls_policies.sql, lo confirma integration al final); URL lleva solo flag+until; preview admin usa `starts_at` con test que reproduce el bug de madrugada closes_next_day + fallback documentado a null; banner trata timestamp futuro como inválido. 7 tests nuevos |
| sonnet-implementer M2b | Tests integración pendientes de M2: TOCTOU cobros concurrentes + ciclo ban manual bajo RLS (escritos SIN ejecutar, ENS-6) | ~124k tokens | ✅ 5 tests nuevos: TOCTOU vía `addBookingChargeAction` REAL (mock solo del borde de sesión, patrón staff-actions; FOR UPDATE de producción, no copia) + 4 casos ban manual (crea/no-duplica/lift/cross-tenant); typecheck+lint verdes; quedan SIN ejecutar hasta el release verifier |
| sonnet-adversarial-reviewer R2 (auth/billing) | Atacar W2 (ENS-20), W7 (ENS-23), W8 (ENS-25/26): doble cobro, acceso indebido post-lock, estados huérfanos, authz de endpoints, races cancel/webhook | ~173k tokens | **RECHAZADO**: 🔴 1 Server Actions sin chequeo de tenant.status (moroso blocked opera por POST directo — preexistente pero el fix de login lo volvió camino normal) → M5; 🔴 2 reactivate() no cancela preapproval viejo → doble cobro real → M6; 🔴 3 pago "en vuelo" reactiva una baja voluntaria (webhook post-cancel) → M6; 🟡 4 botón de baja para suspended da 403 (withTenant read-only) → M6. Resistieron: ENS-23 regex específico, CSRF Fetch-Metadata, roles en /reactivar, sub sin mp_subscription_id, past_due no se cuela por subscribe/upgrade/downgrade. Menores aceptados v1: trialing→canceled por API directa (sin impacto de plata), banner canceled con fecha ya pasada pre-sweep (misma latencia aceptada del dunning) |
| sonnet-adversarial-reviewer R4 (verificación M-fixes) | Verificar hallazgo por hallazgo que R1-A/B/C/E y R3-1/3/5 están MUERTOS en el código + revisión estática de los tests de integración sin ejecutar | ~241k tokens | **APROBADO CON RESERVAS**: R1-A/B/E + R3-1/3/5 CERRADOS con evidencia (tests no tautológicos, atomicidad del UPDATE WHERE status verificada, policies RLS confirmadas, instanceof cruza mocks); 2 gaps → M4: 🟡 clase R1-C abierta en caja (createCashFlowAction acepta bookingId sin validar pendiente — preexistente) y 🟡 retry 120s sin alerta si el error local es determinístico (logger solo stderr, DLQ nunca dispara porque el job completa). Tests de integración nuevos revisados estáticamente: firmas y asserts correctos |
| sonnet-implementer M4 | Cerrar reservas de R4: quitar bookingId del schema de caja (camino canónico = addBookingChargeAction) + captureMessage cuando el retry del precheck lleva >1h | ~192k tokens | ✅ verde 1760/1760 unit + build; bookingId fuera del schema de caja (Zod strip, test pinnea que jamás llega al service; callers legítimos de createCashFlow intactos); alerta Sentry cuando el retry del precheck supera 1h desde `createdAt + cutoff` (arranque real del loop); TDD verificado con revert→rojo→reaplicar. AVISO: flakiness de suite completa bajo contención (dev server + 3 vitest paralelos) en archivos de billing/MP que M6 editaba en simultáneo — pasan aislados; el release verifier debe correr con el entorno quieto |
| sonnet-implementer M5 | Cerrar R2-1: guard central de tenant.status en requireStaffWithRole (blocked/churned/deleted/suspended bloquean; past_due/canceled operan; bypass impersonación) | ~145k tokens | ✅ verde 1736/1736 unit + build; `isBlockedForStaff` en guards.ts con fuente única exportada de with-tenant.ts (sin tercera copia); requireAdminStaff redirige a /suspended, actions devuelven ok:false; /reactivar y /select-tenant NO pasan por los guards (el blocked puede pagar); bypass impersonación vía getImpersonationSession; bonus: finishOnboardingAction cubierto; 19 tests nuevos. Confesó TDD no estricto (test post-implementación, no podía ver el rojo sin git mutante prohibido) |
| sonnet-implementer M6 | Cerrar R2-2/3/4: reactivate cancela preapproval viejo primero; cancel() limpia mp_subscription_id + onPaymentApproved solo reactiva si el preapproval matchea; ruta cancel → withBillingTenant | ~364k tokens (sobrevivió un corte de conexión, retomado) | ✅ verde 1760/1760 unit + build; reactivate cancela viejo ANTES de crear nuevo (error propaga = reactivación falla, jamás doble preapproval); cancel() limpia mp_subscription_id + audit `subscription.mp_preapproval_cleared` (barrido de 6 readers: todos null-safe; lifecycle:314 queda redundante-inofensivo); `preapprovalIdMatches` con semántica undefined=confía en FSM (retrocompatible); ruta cancel → withBillingTenant (403 de suspended muerto). Riesgo residual declarado: campo `linked_to` NO verificado contra MP real → lo verificó el orquestador (abajo) |
| Fable (orquestador) | Verificar `preapprovalId` contra MP REAL + fix inline | inline | ✅ Consulta al pago real de K1 (operación 167921223525) con el token master: `linked_to` NO EXISTE en el payload — el preapproval viene en `point_of_interaction.transaction_data.subscription_id` (= `e00ea2c8…`, exactamente el preapproval que canceló K5). Hipótesis de M6 corregida en mp-gateway.implementation.ts (cast estructural, el SDK no tipa el campo) + tests actualizados al shape real. Sin esto, la protección contra "pago en vuelo reactiva una baja" era no-op silencioso. Juez: typecheck + lint 0 err + 1760/1760 + build ✓ |
| sonnet-adversarial-reviewer R5 (verificación 2da ola) | Verificar que R2-1/2/3/4 y las reservas de R4 están muertos + hallazgos nuevos | ~217k tokens | **APROBADO CON RESERVAS**, ningún 🔴 nuevo: R2-1 CERRADO (26 actions auditadas, impersonación no forjable) con 2 residuos 🟢 (markPublicLinkSharedAction sin guard; staff/actions.ts con 3ra copia de la lista que bloquea `canceled` contra ENS-26); R2-2 SIGUE ABIERTO residual (cancel viejo OK + create nuevo falla → rollback deja id muerto → reintento re-cancela uno ya cancelado); R2-3 CERRADO (10/10, MP_MOCK sin preapprovalId = punto ciego solo E2E); R2-4 backend cerrado PERO sin camino de UI para suspended (layout redirige antes de la página con el botón); reservas R4 ambas CERRADAS → M7 |
| Fable (orquestador) | Verificar doble-cancel de preapproval contra MP REAL | inline | ✅ GET preapproval `e00ea2c8…` = `cancelled`; PUT status=cancelled sobre él → **HTTP 400 "You can not modify a cancelled preapproval."** — el escenario de R5 es real (trabado para siempre) y el error es identificable por mensaje → fix = tolerancia explícita (auto-reparador, cubre también legacy) |
| sonnet-implementer M7 | Cerrar los 4 residuos de R5: tolerancia "ya cancelado" en reactivate (evidencia MP real), baja para suspended en /reactivar, guard en markPublicLinkSharedAction, staff/actions alineado a fuente única (canceled gestiona equipo) | ~315k tokens | ✅ verde 1780/1780 unit + build; `isMpAlreadyCancelledPreapprovalError` (el 400 real llega como body JSON crudo del SDK en `MpGatewayError.cause` — misma técnica que isMpInvalidPayerError) tolerado en reactivate() Y cancel(); MockGateway ahora puede fallar cancelPreapproval (gap del mock cerrado); /reactivar renderiza CancelSubscriptionSection con copy contextual (no promete "acceso hasta fecha pasada" a un suspended); markPublicLinkShared vía requireOperatorStaff; staff/actions deriva de la fuente única SIN eliminar su guard local (verificó que NO pasa por los guards centrales — no era redundante). TDD con revert→rojo→restaurar en los 4. Lateral: staff/actions.test.ts co-localizado (fuera de CI) tiene 2 fallas viejas de resendInviteAction, preexistentes |
| sonnet-release-verifier | Gate completo del estado final: typecheck+lint+unit+**integration(+nuevos sin estrenar)+isolation**+build+e2e chromium aislada :3100 | ~194k tokens | **NO-GO** con diagnóstico limpio: typecheck/lint/unit(1780)/isolation(111)/build VERDES; integration 577/3 ROJO (race-double-payment pinneaba "la seña nunca crea cash_flow", invariante que ENS-21 cambió a propósito — test desactualizado, no bug); e2e 77/4 (3 por NEXT_PUBLIC_APP_URL residual del túnel ngrok + 1 REAL: ENS-27 abajo). Los 3 integration nuevos de la tanda (TOCTOU, bans, tenant-subscription) pasaron limpio al primer estreno. Gotcha nuevo: Next 16 no permite 2 `next dev` del mismo working dir ni en puertos distintos. playwright.config revertido, entorno restaurado |
| Fable (orquestador) | Post-NO-GO: fixes inline de los 2 artefactos | inline | ✅ race-double-payment.test.ts: 3 asserts `toBe(0)`→`toBe(1)` + título + comentarios ENS-21 (la invariante nueva es MÁS fuerte: la carrera no duplica el cash_flow) → re-corrido 3/3 verde; .env.local: APP_URL y NEXT_PUBLIC_APP_URL restauradas de ngrok a localhost:3000 (upsert sin exponer secretos) |
| sonnet-implementer M8 | ENS-27 (🔴 legal preexistente): migración nueva que permite en el trigger SOLO el UPDATE de anonimización (player_id→NULL sin tocar nada más) + test integración con terminales | ~112k tokens | ✅ migración `045_allow_player_anonymization_on_terminal_bookings.sql` + espejo supabase manual (db:sync-supabase está en el deny-list; diff byte-a-byte idéntico); extiende la versión VIGENTE de la función (030, única que la reemplazó tras 005); excepción `NEW.player_id IS NULL AND to_jsonb sin player_id/updated_at iguales` — price_snapshot se valida ANTES (Regla 2), cualquier otra columna rompe la igualdad; tests de control anti-abuso (cambiar time_start solo, o player_id NULL + time_start juntos → bloqueados); TDD rojo por el motivo correcto → 12/12 + **integration COMPLETO 582/582** (confirma también el fix de race-double-payment integrado). Lateral documentado sin tocar: `cleanupPlayerBookings` (e2e helper) traga el error de un UPDATE que el trigger rechaza — inofensivo hoy (el DELETE posterior no pasa por el trigger) |
| sonnet-release-verifier (final) | Re-gate acotado: unit + e2e chromium serial completa (los 4 specs antes-rojos) + veredicto final | ~136k tokens | **GO**: typecheck limpio, unit 1780/1780 (= baseline exacto), e2e chromium 86 tests con 0 rojo real — `player-delete-account` VERDE en e2e vivo (ENS-27/migr. 045 sostiene), los 4 rojos de la corrida 1 eran artefacto del propio workaround de puerto (NEXT_PUBLIC_APP_URL apuntando a :3000 apagado) y quedaron verdes en re-corrida aislada con el env correcto. playwright.config revertido (diff vacío ×2), :3000 respondiendo 200. Advertencia crítica no bloqueante: 160 archivos sin commitear + 34 commits sin pushear |

## Cierre del ensayo (2026-07-14, noche) — VEREDICTO: GO

**El working tree integrado (tanda W1→M8 completa) es de calidad integrable.** Gate final con evidencia:

| Paso | Resultado |
|---|---|
| `pnpm typecheck` | ✅ 0 errores |
| `pnpm lint` | ✅ 0 errores (28 warnings baseline preexistente) |
| `pnpm vitest run tests/unit` | ✅ 241 archivos / **1780 tests** (baseline exacto) |
| `pnpm test:integration --retry=3` | ✅ 86 archivos / **582 tests** (incluye los estrenos: TOCTOU de cobros, ciclo de ban manual, tenant-subscription, anonimización ARCO 12/12) |
| `pnpm test:isolation` (BLOQUEANTE) | ✅ **111/111** |
| `pnpm build` | ✅ (verificado 4 veces sobre este estado) |
| e2e chromium serial (:3100 aislado, MP_MOCK) | ✅ 86 tests, **0 rojo real** (incluye `player-delete-account` = ENS-27 verde en vivo) |

**Qué cerró esta tanda** (resumen ejecutivo; detalle en el ledger):
- 19 ENS fixeados (W1–W8 + M1–M8) + 4 diferidos por decisión documentada (ENS-9/14/18/24).
- 3 ciclos completos de review adversarial fresco (R1→M1/M2/M3, R2→M5/M6, R4/R5→M4/M7) — cada 🔴 de dinero/auth murió con test que lo pinnea.
- 2 verificaciones contra MP REAL del orquestador que corrigieron hipótesis erradas: el preapproval id de un pago de suscripción viene en `transaction_data.subscription_id` (no `linked_to`), y re-cancelar un preapproval da `400 "You can not modify a cancelled preapproval."` (→ tolerancia explícita).
- ENS-27 (🔴 legal preexistente, NO de la tanda): eliminación de cuenta ARCO reparada con migración 045 + e2e verde.

**Deuda aceptada v1 (documentada, no rota)**: preview de cancelación del jugador stale (dinero correcto server-side); DISMISS_KEY del banner global entre tenants; filtro de refunds por description colisionable; banner canceled puede mostrar fecha pasada pre-sweep; trialing→canceled por API directa (sin impacto de plata); MP_MOCK sin preapprovalId (punto ciego solo E2E); `cleanupPlayerBookings` traga un error inofensivo; `processWebhook` (payment.service) es dead code — REQUIERE INPUT antes de borrar.

### Checklist de launch (pendiente, en orden)

1. **🔴 ROTAR CREDENCIALES MP REALES** (client secret + access token de la cuenta master quedaron expuestos en el chat de esta sesión) — panel de MP → Tus integraciones → renovar credenciales; actualizar `.env.local` y el env de prod. Rotar también las claves VAPID y `ENCRYPTION_KEY` usadas en el ensayo antes de prod.
2. **Commitear la tanda** (160 archivos en el working tree — un stash/crash la pierde entera; ya pasó una vez esta sesión) y **pushear los 34 commits locales** (origin/main quedó en `41e0055`; el remoto no tiene ni el stack upgrade).
3. CI verde en GitHub (el push dispara los 4 jobs; e2e corre en PRs a main).
4. `MP_WEBHOOK_SECRET` en prod (la verificación de firma solo es obligatoria en producción).
5. Resend con dominio propio verificado.
6. Deploy de workers (Railway, `Dockerfile.worker`) + Upstash en prod.
7. Smoke en prod post-deploy: primer subscribe real, un refund real, push visual (2 clicks, documentado en la sección 4g).
8. Reconciliación de suscripciones SaaS: riesgo aceptado v1 (ENS-24 diferido), revisar con MRR real.

**La decisión de commit/push es de Lazar** — esta sesión no commiteó nada (regla vigente).
