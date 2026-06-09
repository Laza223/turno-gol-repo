# Síntesis Cross-Layer — Auditoría TurnoGol

> Consolidación de las 4 sesiones de auditoría (negocio, funcional, técnica, calidad/ops).
> Input: ~129 issues individuales sobre 20 documentos.
> Output: síntesis, deduplicación, tabla maestra, veredicto y orden de corrección.

---

## 1. ISSUES CROSS-CAPA

Problemas que solo se ven cruzando información entre las 4 sesiones. No son suma de issues individuales: son fallas sistémicas que cada sesión vio parcialmente.

### CL-01 — La máquina de estados del tenant tiene 4 versiones incompatibles [BLOQUEANTE]

Cada capa describe un ciclo de vida distinto:

| Capa | Fuente | Estados | Inconsistencia clave |
|---|---|---|---|
| Negocio (S1) | Doc 4 | 6 estados, churn día 21, delete día 90 | `trial → churned` directo |
| Negocio (S1) | Doc 9 | 8 estados, churn día 90, delete día 97 | Incluye `BLOCKED` y `DELETED` |
| Funcional (S2) | Doc 6 | State machine sin `trial_expired` | Salta TRIAL→CHURNED el día 31 |
| Técnica (S3) | Doc 13 | ENUM `tenant_status` con ortografía `canceled` (1 L) mientras otros ENUMs usan `cancelled` | Divergencia léxica |
| Ops (S4) | Doc 19 | Runbook asume estados de Doc 4 | No hay playbook para `BLOCKED` |

Cualquier implementación correcta respecto de una capa rompe las otras tres. Esto es el issue raíz del ~30% de los bugs potenciales del sistema: el cron de dunning, las comunicaciones automáticas, el middleware, los tests de isolation, y el runbook de retención dependen de un mismo contrato que no existe.

### CL-02 — El feature estrella (señas MP Checkout) no tiene especificación en NINGUNA capa [BLOQUEANTE]

- S1 lo marca como feature diferenciador sin spec (#8).
- S2 lo usa en Flujos 2, 3, 4 asumiendo que existe.
- S3 tiene schema de `payments` pero sin campos `fees`, `net_amount`, `amount_refunded` (I-19 y técnico #9).
- S4 define tests con mocks pero sin smoke test contra MP sandbox (T-04).

Resultado: 4 capas construyen sobre un flujo inexistente. Cada una asumió que otra lo definía. Si tal como está se mandan los docs a Claude Code, el flujo de señas se va a implementar 4 veces distinto en 4 lugares del código.

### CL-03 — El cobro automático de abonados carece de modelo económico + modelo técnico + modelo operacional [BLOQUEANTE]

- S1 (#9): no define si TurnoGol intermedia fondos o solo gatilla cobro en MP del tenant. No define quién paga el 2,99% (tenant, jugador, TurnoGol).
- S2 (I-19, I-21): no modela refund proporcional si el tenant cancela con abonados pagos; no hay fees en Payment.
- S3: el schema tiene `mp_subscription_id` en Abonado pero sin decisión arquitectónica sobre el modelo de fondos.
- S4 (O-05): no hay reconciliation job entre MP y subscriptions.

Un feature que es "cobro automático" en business docs aparece como "un campo uuid" en schema y como "un mock" en tests. Con IPC 100%+ y 15 abonados/complejo × 200 complejos, esto son ~$125M ARS/mes cruzando fronteras legales sin spec.

### CL-04 — El RLS de la DB no cubre los flujos que la capa funcional define como P0 [CRÍTICA]

- S3 problema grave #1: las policies solo evalúan `current_setting('app.current_tenant_id')`. Para un jugador (sin tenant_id en sesión) el policy retorna `tenant_id = NULL` → fila descartada. **El jugador no puede ver sus propias reservas.**
- S2: US-JUG-002 "Mis Reservas" es P0 — requiere exactamente ese SELECT que el RLS bloquea.
- S4 (T-06): los isolation tests solo ejercitan `SET LOCAL`, no el path `JWT → middleware → RLS`. Van a dar verde y el bug va a aparecer en producción el día 1.
- S3 problema grave #2: Supabase Realtime usa JWT, no `current_setting`. La grilla en tiempo real (Doc 5 §11, uno de los features distintivos) **va a mostrar bookings de otros tenants** si las policies no se duplican.

Cross-layer real: el bug técnico #1 rompe una US P0 del funcional, no es detectado por la estrategia de testing, y el runbook de ops no tiene playbook para "data leak cross-tenant via Realtime".

### CL-05 — pg-boss + Vercel no encajan; nada de lo que depende del worker tiene plan B [CRÍTICA]

- S3 (#3): ADR-005 elige pg-boss, ADR-009 elige Vercel serverless. Doc14 §8.3 admite que no funciona.
- S2: Flujos 5, 6, 8, 11 dependen del worker para cron (generar instancias de abonado, cobrar, expirar partidos, dunning).
- S4 (O-04, O-06): "health check del worker" y "alerta si data-retention job falla" — alertas sobre un worker que nadie decidió dónde corre.

Sin resolver el worker, los 7 flujos de negocio asíncronos tienen 0% de observabilidad porque no hay servicio a monitorear.

### CL-06 — La estrategia de testing no cubre los flujos que la capa funcional marca como P0 [CRÍTICA]

Match directo con el ejemplo del prompt. Doc 16 lista 7 E2E tests. Los flujos de Doc 7 son 12. Faltan tests de E2E para:

| Flujo funcional | Severidad negocio | Test E2E en S4 |
|---|---|---|
| Gestión de staff (US-ADM-004) | Alta (único admin se desactiva = crisis) | NO |
| Modo degradado (Doc 5 §10) | Alta (MP caído día 1° facturación) | NO |
| Reembolso parcial (Doc 7 Flujo 4A/4B) | Alta (edge case real de MP) | NO |
| Dunning visible (Doc 9 §4) | Alta (10+ transiciones de estado) | NO |
| Transformable courts (S3 #4) | Alta (race condition confirmada) | NO |

Además los flujos de señas y de cobro de abonados no se pueden testear porque aún no tienen spec (CL-02, CL-03).

### CL-07 — Facturación electrónica AFIP: bloqueante legal sin representación en las 4 capas [BLOQUEANTE legal]

- S1 (#18): obligación AFIP para ventas B2C digitales.
- S2: no hay entidad `Invoice` ni flujo de emisión.
- S3: schema no tiene tabla de comprobantes.
- S4 (R-06): "procedimiento requerimiento legal" genérico pero no hay playbook AFIP.

TurnoGol procesando señas sin emitir factura puede hacer al complejo directamente responsable y a TurnoGol subsidiariamente. Esto no aparece como "falta definir si emitimos" en ningún doc — simplemente no existe.

### CL-08 — La relación Player ↔ Tenant no modelada bloquea RLS, audit y moderación [CRÍTICA]

- S1 (#7): Doc 3 dice "abonado = jugador con contrato", Doc 5 dice "players es tabla global". Pero no define la tabla intermedia.
- S2 (I-15): persona "Agustín" tratada como 5ta persona contradice el premise.
- S3: sin esa relación, el `player_id` del RLS (CL-04 opción B) no sabe qué tenants puede ver el jugador.
- S4 (T-06): isolation tests de jugador no pueden existir.

Sin `player_tenant_relationships` con `(status, bookings_count, noshow_count, blocked_at)` no se puede implementar: lista negra por complejo, historial no-show por complejo, consent de datos del jugador al complejo, derecho al olvido granular (Ley 25.326).

### CL-09 — Inconsistencia ortográfica de ENUMs se cuela por 4 capas [ALTA]

- S1 usa `canceled` (Doc 9) y `churned` (Doc 4).
- S2 usa `cancelled` y `canceled` indistintamente.
- S3 (#6): `tenant_status` y `subscription_status` usan `canceled`; `booking_status` y `abonado_status` usan `cancelled`.
- S4: los tests asumen uno u otro sin check.

Es un detalle técnico pero golpea 4 capas: copies en comunicaciones WA, ENUMs en DB, strings en frontend, asserts en tests. Si cambia una sin el resto, cadena de falsos negativos en producción.

### CL-10 — Tres fuentes de verdad para el estado de suscripción [ALTA]

- S2 (I-12): `Tenant.status`, `Tenant.subscription_status`, `TenantSubscription.status`.
- S1 (#1, #2): Doc 4 y Doc 9 pisan cada uno distintas combinaciones.
- S3: schema declara las tres sin trigger de sincronización.

Dos devs van a poner lógica en campos diferentes. El middleware de "¿tenant activo?" va a consultar uno, el job de dunning va a updatear otro, el audit log va a loggear el tercero.

### CL-11 — Costos WhatsApp + quota + unit economics se resuelven en capas distintas [BLOQUEANTE economics]

- S1 (#10): estimación 30-300x subestimada. MRR target $7.6M vs costo WA estimado ~$28M = operación deficitaria.
- S4 (O-07): tracking de quota Meta WA.

S4 propone la alerta como si el problema fuese ceiling de 250 msg/hora. S1 muestra que el ceiling es el segundo problema: el primero es que el modelo no cierra. Ninguna capa propone user-initiated como alternativa sistemática.

### CL-12 — Restricción +18 (privacy crítico) no tiene reflejo en personas, schema ni tests [CRÍTICA]

- S4 (P-01): sin restricción, un menor de 13 puede registrarse. Crítico legal.
- S1 Doc 3 personas: sin edad declarada en Persona 3 (Tomás) ni en ninguna.
- S3: `players` no tiene campo `birth_date` ni validación +18.
- S2: Flujo 0 (registro de jugador) no incluye paso de declaración jurada.

Requisito de privacy aislado en S4. Los otros 3 niveles necesitan cambios coordinados.

### CL-13 — Los RNF de Doc 5 (99.5%, read replica, test restore mensual) chocan con el runbook unipersonal [ALTA]

- S1 (#17): RNFs combinados exceden capacidad 1-3 personas.
- S4 (R-01, R-02, R-09): SEV-1 < 15 min es aspiracional; grupo WA de emergencias con 1 persona es decorativo.

La contradicción: el contrato con el tenant promete 99.5% pero el equipo no puede atenderlo. Si TurnoGol sigue con el claim, es exposición legal. Si lo baja a 99%, necesita rehacer comunicación comercial.

### CL-14 — Canchas transformables: problema identificado en 3 capas distintas, resolución inconsistente [ALTA]

- S2 (I-18): `SELECT FOR UPDATE` sobre `courts.id` serializa toda la cancha en horario pico.
- S3 (#4): trigger `check_transformable_court_availability` tiene TOCTOU race, solicita `SELECT FOR UPDATE` sobre courts madre+hijas.
- S4 (T-01): no hay E2E test de transformables desde UI.

Cada capa propone fix local sin coordinar. Sin una solución transversal (probablemente exclusion constraint extendida + service wrapper + E2E test), vas a arreglar el trigger, romper la performance, y no enterarte hasta que un viernes a las 20hs dos reservas pegan al mismo slot.

### CL-15 — Cancelación/refund en cadena: mismo tema en 4 variantes distintas sin política unificada [ALTA]

- S1 (#15): cancelación voluntaria del tenant → refund a participantes de partidos abiertos, sin definir quién absorbe.
- S2 (I-21): tenant cancela con abonados pagos del mes, sin política de refund proporcional.
- S2 (I-17): Flujo 4A asume refund MP siempre; no cubre seña en efectivo.
- S4 (R-05): sin script de export/cleanup al churn.

Cuatro decisiones políticas independientes que el equipo va a resolver ad-hoc la primera vez que pase cada una. Dado AR + defensa del consumidor + chargebacks, es riesgo legal acumulativo.

---

## 2. DEDUPLICACIÓN

Issues que aparecieron en múltiples sesiones. Se unifican con la severidad más alta.

| Issue unificado | Sesiones | IDs originales | Severidad final |
|---|---|---|---|
| State machine tenant incompatible + ENUMs inconsistentes | S1, S2, S3 | S1#1, S2 I-07, S3 #6 | BLOQUEANTE (era S1) |
| Flujo de señas MP Checkout sin spec | S1, S2, S3, S4 | S1#8, S2 (Flujos 2/3/4 implícito), S3 #9, S4 T-04 | BLOQUEANTE |
| Cobro automático abonados sin modelo económico | S1, S2, S3, S4 | S1#9, S2 I-19, S3 (mp_subscription_id), S4 O-05 | BLOQUEANTE |
| Comisiones MP (fees, net_amount) no modeladas | S1, S2, S3 | S1#4.2, S2 I-19, S3 (Payment schema) | ALTA |
| processed_webhooks sin schema ni TTL | S2, S3 | S2 I-29, S3 #18 | ALTA |
| Facturación electrónica AFIP | S1 | S1#18 (único pero crítico transversal) | BLOQUEANTE legal |
| RNF Doc 5 vs equipo chico | S1, S4 | S1#17, S4 R-01/R-02/R-09 | ALTA |
| Ley 25.326 / privacy | S1, S4 | S1#22, S4 P-01 a P-06 | CRÍTICA (+18 es CRÍTICO) |
| RLS no cubre jugador ni Realtime | S3, S4 | S3 #1/#2, S4 T-06 | CRÍTICA |
| Testing strategy no cubre 5 flujos P0 | S2, S4 | S2 I-13, S4 T-01 | ALTA |
| Ventana 24h correction vs inmutabilidad | S2 | S2 I-16 (interno doc6-doc7-doc8) | ALTA |
| pg-boss worker contradicción | S3, S4 | S3 #3, S4 O-04 | CRÍTICA |
| Canchas transformables race condition | S2, S3, S4 | S2 I-18, S3 #4, S4 T-01 | ALTA |
| Timer 15 min no contempla in_process MP | S1, S2 | S1 (Doc 5 §10 parcial), S2 I-20 | ALTA |
| Refund en cadena sin política | S1, S2, S4 | S1#15, S2 I-17/I-21, S4 R-05 | ALTA |
| Player ↔ Tenant no modelado | S1, S2, S3 | S1#7, S2 I-15, S3 (RLS depende) | CRÍTICA |
| Onboarding 20 min vs Marcelo tech 2.5/5 | S1 | S1#13 | ALTA |
| Plan anual + inflación destruye margen | S1 | S1#11 | ALTA |
| Upgrade/downgrade con abonados activos | S1, S2 | S1#14, S2 (US-SAS-004 sin Flujo) | ALTA |

---

## 3. TABLA MAESTRA CONSOLIDADA

~100 issues unificados ordenados por severidad. "Capa" indica sesión origen (N=Negocio, F=Funcional, T=Técnica, O=Ops, X=cross-layer). "Doc(s)" indica documentos afectados.

### BLOQUEANTES (9)

| ID | Capa | Doc(s) | Descripción | Acción |
|---|---|---|---|---|
| B01 | X | 4, 9, 6, 13 | Máquina de estados tenant tiene 4 versiones incompatibles entre docs | Unificar en un solo diagrama autoritativo; actualizar schema, ortografía ENUMs, runbook |
| B02 | X | 1, 2, 7, 13, 16 | Flujo de cobro de señas MP Checkout sin spec en ninguna capa | Escribir spec: %, política refund, split payments, webhooks, captura, timeout, MP in_process |
| B03 | X | 2, 4, 7, 13, 17 | Cobro automático abonados sin modelo económico/técnico/operacional | Definir: ¿TurnoGol intermedia o gatilla? ¿MP Suscripciones propia del tenant requerida? Comisiones (quién paga 2,99%) |
| B04 | N | 4 | Costo WhatsApp API subestimado 30-300x; unit economics deficitarios | Validar pricing real con BSP (Twilio/WATI/Infobip AR); rediseñar flujos para maximizar user-initiated y templates free |
| B05 | N | — | Facturación electrónica AFIP (WSFEv1) ausente en 20 docs | Decidir: emisor propio vs partner (Tango/Xubio API); integración con puntos de venta |
| B06 | T | 12, 13 | RLS solo evalúa current_setting → jugador no ve sus reservas | Agregar `app.current_player_id` y extender cada policy con `OR player_id = ...` |
| B07 | T | 12, 13 | Supabase Realtime usa JWT no current_setting → grilla expone cross-tenant | Duplicar cada policy con cláusula `OR tenant_id = auth.jwt() -> ...` |
| B08 | T | 11, 14 | pg-boss + Vercel incompatibles; 7 flujos asíncronos sin worker confirmado | Nueva ADR: elegir Railway/Fly vs Vercel Cron vs reemplazar pg-boss |
| B09 | F | 6, 7 | Entidad Plan listada en tabla final pero sin sección definida; Flujo 10 la usa intensivamente | Agregar sección con campos: name, max_courts, monthly_price, annual_price, mp_plan_id_{monthly,annual}, features (JSONB) |

### CRÍTICAS (8)

| ID | Capa | Doc(s) | Descripción | Acción |
|---|---|---|---|---|
| C01 | F | 6, 7 | Entidad DailyCashClose omitida; Flujo 9 la crea con 8 campos | Agregar entidad con tenant_id, date, total_{income,expense}, balance, declared_cash, diff_amount, note, closed_by, closed_at |
| C02 | F | 6 | AuditLog, TenantPlayerBan, ProcessedWebhook listadas pero sin schema | Definir las tres; AuditLog es la más urgente por aparecer en todos los flujos |
| C03 | F | 6 | Tenant no tiene campos OAuth MercadoPago pero Flujo 1 paso 6 los guarda | Agregar mp_access_token, mp_refresh_token, mp_user_id, mp_public_key, mp_connected_at (encriptados at-rest) |
| C04 | X | 3, 5 | Relación Player ↔ Tenant no modelada bloquea RLS, moderación, lista negra | Crear `player_tenant_relationships` con status, bookings_count, noshow_count, blocked_at, first_seen_at |
| C05 | F | 6, 7 | SELECT FOR UPDATE sobre courts.id serializa cancha en prime-time | Usar exclusion constraint con btree_gist (ya declarada como invariante pero no implementada) |
| C06 | O | 18 | Sin restricción +18; menor de 13 puede registrarse. Crítico legal (Ley 26.061) | Declaración jurada de +18 en signup de jugador; validación en backend |
| C07 | O | 17 | Sin alerta de expiración de token Meta WA | Alerta proactiva a T-14 y T-7 días antes de expiración |
| C08 | N | 1, 2 | WhatsApp API Meta: además de costos, quota 250 msg/hora tier básico sin plan | Contador `wa_sent_last_hour` + alerta al 80%; estrategia multi-número o upgrade tier |

### ALTAS (44)

| ID | Capa | Doc(s) | Descripción | Acción |
|---|---|---|---|---|
| A01 | N | 4, 9 | Timeline dunning inconsistente (día 4/5, 21/90, 90/97) | Unificar timeline único + corregir aritmética de Doc 4 §3 (día 51 + 39 ≠ día 90) |
| A02 | N | 4, 9 | Descuento anual 25% (Doc 4) vs 33% (Doc 9) | Decidir % único; validar contra inflación antes de cerrar |
| A03 | N | 4, 9 | Nombres de planes Starter/Pro/Full vs Básico/Estándar/Full | Elegir nombres canónicos y reemplazar en landing, checkout, copies, tests |
| A04 | N | 4, 9 | "Solo lectura" post-trial (Doc 4) vs BLOCKED sin acceso (Doc 9) | Definir ventana de solo-lectura o bloqueo directo; impacto sobre export de datos y ley 25.326 |
| A05 | N | 3, 5 | Relación player ↔ tenant sin tabla intermedia explícita | (ver C04) |
| A06 | N | 4 | Plan anual con IPC 100%+ destruye margen 6-9 meses post-venta | Eliminar anual plain; cláusula de ajuste CER/IPC o descuento a 10% fijo |
| A07 | N | 4 | MP Suscripciones requiere tarjeta crédito; ~30% tenants no tienen | Documentar fallback: DEBIN, pago manual mensual por MP Checkout link |
| A08 | N | 3, 10 | Onboarding self-service 20 min choca con Marcelo tech 2.5/5 | Opción "onboarding asistido 30 min" para Pro/Full; medir con 10 tenants piloto |
| A09 | N | 4, 6 | Upgrade/downgrade no cubre abonados activos ni partidos abiertos publicados | Agregar "Efectos cascada de cambio de plan" en Doc 4 §6 y nuevo Flujo 13 |
| A10 | N | 9 | Cancelación voluntaria dispara refunds sin definir responsable | Refund se gatilla contra cuenta MP del tenant antes de desconectar; si no hay fondos, TurnoGol no cubre, documentado |
| A11 | N | 4 | Tenant suspended crea crisis para 15 abonados (sin recordatorios, sin cobro, sin cancelación) | Durante suspended: seguir WA a jugadores + pausar cobros automáticos + notificar estado del complejo |
| A12 | N | 4 | Retenciones MP (IIBB, Ganancias, IVA) no documentadas | Sección "Tributario argentino" con tratamiento por tipo de contribuyente (Monotributo/RI) |
| A13 | N | 2 | Importador ATC/CSV mencionado como anti-switching sin spec | Spec de columnas, validación, preview, rollback, mapeo |
| A14 | N | 2 | "Gestión de gastos" como diferenciador sin spec | Escribir spec (categorías, flujo, integración con caja) o removerla del posicionamiento |
| A15 | N | — | Política de privacidad / Ley 25.326 ausente | Consent flows, política retención, DPA con MP/Meta/email, registro AAIP |
| A16 | N | — | Política de cancelación de reservas/señas con escenarios (lluvia, cierre fuerza mayor) | Matriz: escenarios × tiempo × % reembolso, con override del tenant |
| A17 | N | — | Persona "contador del complejo" no existe | Agregar Persona 5 con JTBD de exportación contable (retenciones, caja mensual) |
| A18 | N | — | Roadmap / MVP priorizado ausente | Doc "v1.0 scope" con criterios must/should/won't y orden de sprints |
| A19 | N | 4, 7 | Webhooks de seña de jugador (MP Checkout) no documentados | Tabla de webhooks MP Checkout + manejo idempotente (depende de B02) |
| A20 | N | — | Chargebacks/disputas ausentes en 20 docs | Flujo: notificación al tenant, evidencia a MP, quién absorbe costo |
| A21 | N | 4 | SLA de soporte por plan sin tiempo de respuesta ni horario | Redactar SLA realista para equipo 1-3; alinear con R-09 |
| A22 | F | 6, 8 | Court state machine 2 estados vs US-ADM-001 con 3 (active/maintenance/inactive) | Decidir: agregar `maintenance` o eliminarlo del US |
| A23 | F | 6, 7 | Tenant state machine no contempla "trial vencido bloqueado recuperable" | (subsumido por B01) |
| A24 | F | 6 | MatchParticipant: JOINED → NO_SHOW incorrecto; falta CONFIRMED → REFUNDED | Redibujar state machine |
| A25 | F | 6, 7 | Tres fuentes para estado suscripción (Tenant.status, Tenant.subscription_status, TenantSubscription.status) | Declarar una fuente de verdad; trigger de sincronización |
| A26 | F | 7, 8 | Sin Flujo E2E para CRUD canchas, staff, productos, políticas, horarios, transformables | Agregar Flujos 13-15 en Doc 7 |
| A27 | F | 6, 7, 8 | Ventana 24h corrección completed → no_show contradice inmutabilidad | Decidir política; generar CashFlow compensatorios, no editar pasado |
| A28 | F | 7 | Flujo 4A asume refund MP siempre; no cubre seña efectivo (muy común AR) | Variante 4A-efectivo con mensaje "contactá al complejo" |
| A29 | F | 7 | Sin modelado de comisiones MP en Payment ni CashFlow | Agregar `fees` y `net_amount` a Payment; CashFlow registra neto |
| A30 | F | 7 | Timer 15 min no contempla MP in_process por CBU (24-48hs) | Separar "checkout abandonado" de "pago pendiente acreditación" |
| A31 | F | 7 | Tenant cancela con abonados pagos del mes, sin política refund proporcional | Documentar en Flujo 12; alineado con A10 |
| A32 | F | 7 | Cambios de precio en abonado vigente sin flujo ni política | Definir si `price_per_session` es editable, notificación obligatoria, plazo mínimo |
| A33 | F | 7 | Cierre de caja vs corrección no-show: conflicto inmutabilidad | Correcciones post-cierre generan CashFlow compensatorios |
| A34 | F | 6, 7 | processed_webhooks sin schema ni TTL | Tabla con mp_payment_id, received_at, processed_at, raw_payload; TTL 90 días |
| A35 | T | 13 | ENUMs mezclan `cancelled` (booking, abonado) con `canceled` (tenant, subscription) | Unificar a `canceled` (americano) |
| A36 | T | 13, 14 | Canchas transformables: trigger BEFORE sin lock → TOCTOU | `SELECT FOR UPDATE` sobre courts madre+hijas en transacción |
| A37 | T | 14 | Drizzle + Supabase pooler: `SET LOCAL` se pierde sin `db.transaction()` | Wrapper obligatorio `withTenantContext(fn)` + ESLint rule |
| A38 | T | 11, 15 | ADR-006 Realtime calcula 1.000-1.500 conexiones pero Pro soporta 500 | Validar; presupuestar Team plan o pooling client-side |
| A39 | T | 13 | Falta índice en `payments.mp_preference_id` (1.2M filas/año) | `CREATE INDEX WHERE mp_preference_id IS NOT NULL` |
| A40 | O | 16 | Falta check automático que toda tabla con tenant_id esté en ISOLATED_TABLES | Test meta que lea information_schema y compare |
| A41 | O | 16 | Sin tests de carga reales (>2 requests concurrentes al mismo slot) | k6/artillery con 100 reservas concurrentes pre-launch |
| A42 | O | 16 | Tests de migrations faltantes | Tests sobre DB seedeada con 100k filas; idempotencia y rollback |
| A43 | O | 17 | Métricas de negocio sin alertas de salud | 0 bookings prime-time viernes/sábado, past_due growth, booking.conflict > 5% |
| A44 | O | 17 | Health check no detecta worker pg-boss colgado | Check: último completed en < 15 min |
| A45 | O | 17 | No hay reconciliación MP vs subscription | Job diario; alerta si payment approved pero subscription inactiva |
| A46 | O | 17 | data-retention-cleanup puede fallar silenciosamente (compliance) | Alerta obligatoria si cron no completa |
| A47 | O | 19 | Grupo WA Emergencias con 1 persona = decorativo | Email secundario + contacto de respaldo; mini-runbook para no técnicos |
| A48 | O | 19 | Sin procedimiento para vacaciones/licencias solo-dev | Documentar escalación a contacto externo |
| A49 | O | 19 | Sin procedimiento para cuenta comprometida (service_role filtrada) | Playbook: rotar → forensics → revocar → notificar |
| A50 | O | 20 | MASTER.md en markdown no es código; riesgo de deriva | Traducir a `tailwind.config.ts` + CSS vars día 1 |
| A51 | X | 16-20 | 5 docs de capa calidad/ops juntos exceden capacidad equipo 1-3 para v1 | Cortar según §6 doc20: solo "esencial" va a v1 |

### MEDIAS (27)

| ID | Capa | Doc(s) | Descripción | Acción |
|---|---|---|---|---|
| M01 | N | 4, 9, 10 | Tres cronogramas de notificaciones de trial distintos | Unificar calendar único (canal, tipo, trigger, día) |
| M02 | N | 4 | Trial post-churn: 90 días desde churn vs 90 desde BLOCKED | Alinear con B01 |
| M03 | N | 10, 5 | Wizard horarios sin aclarar zona horaria del input | Convención "hora local del complejo" + offset ART (UTC-3) |
| M04 | N | 5 | RNFs 99.5% + read replica + test restore mensual exceden equipo 1-3 | Priorizar: 99.5% + RLS v1; read replica + restore v1.5 |
| M05 | N | 3 | Abonado colapsado con jugador oculta JTBD divergentes | Mantener persona única con sección JTBD duplicada por modo |
| M06 | N | 3 | JTBD primario Marcelo no refleja Dolor #1 (no-show) | Revisar JTBD para incluir "eliminar no-shows" |
| M07 | N | 3 | Persona Rodrigo sin flow alta/baja ni audit | User story "invitar staff" + qué pasa con actor_id al desactivar |
| M08 | N | — | Persona 5 soporte interno TurnoGol ausente | Crear persona + panel interno para outreach |
| M09 | N | — | Estacionalidad fútbol AR (enero -50%, mundial pico) ignorada | Rehacer Doc 4 §10 con estacionalidad + política "pausar abono" |
| M10 | N | 10 | Feriados excluidos del wizard pero nunca modelados | Sección "Calendario y excepciones" en roadmap post-wizard |
| M11 | N | — | Analytics / instrumentación ausente | Elegir herramienta (PostHog) + eventos core |
| M12 | N | 2 | Estrategia B2C adquisición jugadores ausente | SEO por ciudad, ASO PWA, referidos |
| M13 | N | 5 | Graceful degradation no cubre MP Suscripciones caído día 1° facturación global | Circuit breaker + retries exponenciales + notificación proactiva |
| M14 | N | — | Moderación partidos abiertos ausente | Si entra v1: reporte, bloqueo, review por admin complejo |
| M15 | N | 3 | Sin preference center notificaciones → silenciado masivo | Opt-in granular (recordatorios/abono/promo) por jugador |
| M16 | N | 5 | Conectividad del mostrador con WiFi cayendo: grilla stale = doble-booking | Definir comportamiento offline de grilla |
| M17 | N | 4 | Precios no aclaran IVA in/out | Definir y reflejar en landing + checkout |
| M18 | F | 6 | PriceVersion orfanato (aparece en tabla, nadie la usa) | Eliminar o definir propósito y agregar a flujos |
| M19 | F | 6 | Payment y TenantSubscription sin state machine explícita | Agregar diagramas |
| M20 | F | 8 | US-SAS-002/US-SAS-005: P0 en header vs P3 en tabla resumen | Corregir tabla resumen |
| M21 | F | 8 | Persona Agustín (Abonado) tratada como 5ta persona contra el premise | Consolidar dentro de Tomás |
| M22 | F | 7 | Feriado agregado después de generar instancias sin política | Cancelación automática vs opción manual |
| M23 | F | 7 | Cobro abonado auto_mp sigue con tenant suspendido | Definir política (alineado con A11) |
| M24 | F | 6 | Horarios operativos cruzando medianoche no modelados | Convención para representar 20:00 → 02:00 del día siguiente |
| M25 | F | 7 | Refunds parciales MP no modelados | Campo `amount_refunded` en Payment |
| M26 | T | 13 | Sin CHECK constraints para invariantes booking_type | CHECK expressions o trigger (block ⇒ player_id IS NULL, fixed ⇒ abonado_id IS NOT NULL, etc.) |
| M27 | T | 12, 13 | Tablas `tenants` y `staff_users` sin RLS | Policies específicas (staff ve solo su tenant; admin ve solo su propio staff) |

### BAJAS (14)

| ID | Capa | Doc(s) | Descripción | Acción |
|---|---|---|---|---|
| L01 | N | 3 | Persona Lucas (organizador): volumen real cuestionable en v1 | Postergar partidos abiertos a v1.5; priorizar marketplace simple + abonados + señas |
| L02 | N | 5 | Magic link 15 min muy corto para Marcelo tech 2.5 | Extender a 60 min o reenviar con 1 click |
| L03 | N | 5 | Sección "Accesibilidad" solo habla de performance | WCAG 2.1 AA baseline para v1.5 |
| L04 | N | 5 | Sin i18n strategy (ARS vs CLP vs PEN, vos vs tú) | Documentar para expansión LATAM post-v1 |
| L05 | N | — | Organigrama equipo TurnoGol ausente | División de roles al escalar a 5-10 personas |
| L06 | N | 4 | Pricing modificado por canal (win-back 20% off) sin spec | Cupones, promo codes, attribution |
| L07 | F | 6 | Booking.deposit_status = 'captured' confuso | Renombrar o documentar explícitamente |
| L08 | F | 7 | Organizador siempre participante vs Flujo 8 edge "0 participantes" | Eliminar edge imposible o permitir que organizador se salga |
| L09 | F | 6 | Booking.type = 'event' en enum sin flujo dedicado | Eliminar o documentar propósito |
| L10 | F | 6 | Player.status = 'suspended' estado huérfano | Eliminar o definir cuándo se activa |
| L11 | T | 13 | Exclusion constraint no escala a reservas cruzando medianoche | Considerar `tstzrange` |
| L12 | T | 13 | `audit_logs` sin particionado → 10-20GB año 2 | Particionado por mes desde migration inicial |
| L13 | T | — | Over-engineering: open_matches, bans, price_versions, feature_overrides diferibles | Shippear v1 con ~11 tablas core |
| L14 | O | 20 | Sin lint rule contra colores hardcodeados | ESLint plugin desde sprint 0 |

---

## 4. VEREDICTO FINAL

### NO. La documentación NO está lista para pasar a código con Claude Code.

Razón corta: hay 9 bloqueantes, la mayoría de ellos cross-layer. Claude Code en un proyecto con estos docs va a hacer una de dos cosas:

1. Elegir una interpretación por bloqueante (hay 4 versiones de la state machine del tenant) y construir un sistema coherente internamente pero que contradice ~30% de los docs.
2. Pedir clarificación a cada paso y avanzar un 5% por semana.

Ninguna de las dos produce software entregable. El riesgo real es el caso (1) sin que nadie lo note hasta que el equipo de growth pida una métrica de dunning y la respuesta sea "¿día 21 o día 90?" — ahí se va a descubrir que lo ya construido es incompatible con los otros documentos, y la refactorización es masiva porque el bloqueante se coló en schema, middleware, cron, comunicaciones y tests.

### Top 5 correcciones ANTES de codear (ordenadas por impacto)

1. **Unificar Doc 4 + Doc 9 en un solo spec autoritativo de lifecycle (B01, A01-A04, M01-M02).**
   Un único documento con: 8 estados canónicos, timeline de dunning único, descuento anual único, nombres de planes únicos, calendario de notificaciones único. Deprecar lo contradictorio de Doc 4 y Doc 9. Impacto: elimina ~25% de los issues de S1 de un saque.

2. **Escribir specs de los 3 flujos de MP que no existen (B02, B03, A19, A29, A30, M25).**
   Flujo señas MP Checkout, flujo cobro automático abonados, flujo subscripción SaaS. Cada uno con: actores del split payment, % comisión y quién la absorbe, política de refund/chargeback, webhooks y su idempotencia, estados de pago (incluyendo in_process CBU), captura parcial. Impacto: desbloquea los Flujos 2, 3, 4, 6, 10 de Doc 7 y el schema de `payments`.

3. **Resolver los 3 issues técnicos críticos en una ADR nueva (B06, B07, B08).**
   RLS con `app.current_player_id` + policy doble para Realtime (JWT), y decisión sobre dónde corre el worker pg-boss (Railway $5/mes es la respuesta más probable, pero necesita ADR). Impacto: evita reescribir todas las policies y todo el manejo async después.

4. **Completar las 6 entidades faltantes del schema (B09, C01, C02, C03, C04).**
   Plan, DailyCashClose, AuditLog, TenantPlayerBan, ProcessedWebhook, credenciales MP en Tenant, y tabla player_tenant_relationships. Impacto: sin estas 6 piezas ~40% de los flujos no compilan.

5. **Validar costos reales de WhatsApp API con un BSP argentino + resolver AFIP (B04, B05, C08).**
   Dos decisiones de negocio que bloquean el plan de lanzamiento. Si WhatsApp cuesta 30x lo estimado, hay que rediseñar el modelo de notificaciones (user-initiated, templates free) o subir precios. Si AFIP obliga a integración, hay que decidir entre emisor propio o partner antes de diseñar el flujo de pagos.

### Nota sobre el "top 5 riesgos durante desarrollo"

No aplica. Pero si decidís ignorar este veredicto y codear igual, los 5 riesgos a vigilar son: (a) que el dev elija la state machine que menos impacto sienta en el momento y el equipo comercial se entere tarde, (b) que el flujo de señas se implemente inconsistente entre reserva manual, reserva web y partido abierto, (c) que el RLS del jugador se parchee con service_role y quede como deuda permanente, (d) que los mocks de MP pasen verdes hasta el día de producción, (e) que el worker de pg-boss se "olvide" de configurar hasta que falle un cron crítico a las 3 AM.

---

## 5. ORDEN DE CORRECCIÓN (evitar cascadas)

Las correcciones tienen dependencias. Cambiar el orden genera retrabajos: si corregís el schema antes de unificar Doc 4+9, vas a re-hacer migraciones. Si corregís RLS antes de definir player ↔ tenant, vas a rescribir policies. Abajo el orden con las dependencias.

### Tier 0 — Decisiones de negocio (sin ellas, nada más puede empezar)

```
Paso 1: Unificar Doc 4 + Doc 9 → "Doc 4/9 Merged"
        Salida: estado del tenant, dunning, precios, planes, descuentos, calendar notif — todo único

Paso 2: [paralelo con 3-5] Escribir spec flujo señas MP Checkout
        Depende de: Paso 1 (necesita saber qué pasa con seña si tenant está suspended)

Paso 3: [paralelo con 2, 4, 5] Escribir spec flujo cobro automático abonados
        Depende de: Paso 1 (estado suspended = ¿sigue cobrando?)

Paso 4: Validar costos WhatsApp API con BSP AR real
        No depende de nada técnico; sí depende de decidir volumen esperado (acordar con Paso 1)
        Si cierra → seguir. Si no cierra → rediseñar modelo de notificaciones ANTES de seguir.

Paso 5: Decidir facturación AFIP (emisor propio vs partner)
        Depende de: Paso 2 (necesita saber qué comprobante se emite por seña)
```

### Tier 1 — Infraestructura técnica dependiente de Tier 0

```
Paso 6: Definir player_tenant_relationships (C04)
        Depende de: Paso 1 (política de qué ve el jugador post-trial/suspension)

Paso 7: Nueva ADR: RLS para jugador + Realtime
        Depende de: Paso 6 (la tabla intermedia define cómo filtrar)

Paso 8: Nueva ADR: worker pg-boss (Railway/Fly/Vercel Cron/reemplazo)
        No depende de Tier 0 pero debe hacerse antes de escribir Flujos 5/6/11

Paso 9: Completar 6 entidades del schema (Plan, DailyCashClose, AuditLog, TenantPlayerBan, ProcessedWebhook, credenciales MP en Tenant)
        Depende de: Pasos 1, 2, 3 (los flujos de pago definen qué campos entran en Payment/ProcessedWebhook)

Paso 10: Unificar ortografía ENUMs a `canceled`
         Depende de: Paso 1 (state machine definitiva)
```

### Tier 2 — Políticas y edge cases

```
Paso 11: Flujos 13-15 en Doc 7 (CRUD canchas/staff/productos, venta de producto, upgrade/downgrade con prorrateo)
         Depende de: Paso 1 (upgrade/downgrade necesita reglas de prorrateo)

Paso 12: Política refund en cadena (tenant cancela, abonados pagos del mes, seña efectivo)
         Depende de: Pasos 2, 3 (define cómo funciona el refund en cada modo)

Paso 13: Política cambio de precio en abonado vigente + plan SaaS
         Depende de: Paso 1

Paso 14: Ventana 24h corrección vs inmutabilidad cierre caja
         Depende de: Paso 9 (DailyCashClose entity)

Paso 15: Política tenant suspended con abonados / partidos publicados
         Depende de: Pasos 1, 3
```

### Tier 3 — Calidad, ops, privacy (se pueden hacer paralelos entre sí después de Tier 2)

```
Paso 16: Restricción +18 + Política Privacidad Ley 25.326
         Depende de: Paso 6 (player_tenant_relationships define qué se borra en derecho olvido)

Paso 17: Design system a código (tailwind.config.ts + CSS vars + ESLint rule)
         Independiente

Paso 18: Key rotation runbooks (MP, Supabase, Sentry)
         Depende de: Paso 9 (saber qué credenciales se rotan)

Paso 19: Alertas observabilidad (tokens Meta, worker pg-boss, reconciliación MP, data-retention, WA quota)
         Depende de: Pasos 8 (worker), 2/3 (MP flows)

Paso 20: E2E tests faltantes (staff, degraded, refund partial, dunning, transformables)
         Depende de: Pasos 11 (Flujo 13-15) y 12 (política refund)

Paso 21: Roadmap v1.0 explícito (must/should/won't + sprints)
         Depende de: todo lo anterior (no se puede priorizar sin specs completas)
```

### Cascadas a evitar (ejemplos concretos)

- **Si empezás Paso 9 antes de Paso 1:** definís `tenant_status` con 6 estados, escribís migration, generás tipos Drizzle, escribís middleware; Paso 1 después decide 8 estados → tirás todo.
- **Si empezás Paso 7 antes de Paso 6:** escribís policies con `app.current_player_id` asumiendo que el player ve todos sus tenants; Paso 6 define que puede haber tenants bloqueados (jugador baneado en complejo X pero activo en Y) → tenés que reescribir las policies.
- **Si empezás Paso 19 antes de Paso 8:** armás alerta para "worker colgado" contra Railway, después se decide Vercel Cron → reescribís alerta.
- **Si empezás Paso 20 antes de Paso 12:** escribís E2E de refund parcial con política asumida, después la política sale distinta → reescribís el test.
- **Si empezás Paso 17 en paralelo con los demás (se puede):** el riesgo es que aparezcan inconsistencias con componentes existentes si ya hay UI implementada con tokens markdown-only; si el proyecto está greenfield, Paso 17 se puede adelantar sin costo.

### Ritmo estimado

- Tier 0: 5-10 días de trabajo de producto (no es codear — es decidir).
- Tier 1: 3-5 días de trabajo arquitectónico (ADRs + schema refinado).
- Tier 2: 3-5 días de definición de políticas.
- Tier 3: paralelo, empieza cuando Tier 2 está cerrado.

**Total estimado antes de escribir código de producto: 2-3 semanas de trabajo de diseño/documento.** Es mucho para un equipo que quiere shippear, pero es infinitamente menos que refactorizar un sistema que se construyó sobre 4 versiones del lifecycle del tenant.

---

## Apéndice: qué NO es cross-layer pero vale la pena mencionar

- **Design system (S4 D-01 a D-04):** autocontenido en capa ops. No impacta las otras capas hasta que haya UI implementada.
- **Magic link 15 min (L02):** autocontenido. Decisión de UX.
- **Particionado audit_logs (L12):** autocontenido. Decisión de DBA.
- **Over-engineering tablas v1 (L13):** parcialmente cross-layer (afecta scope de Flujos 7/8 en S2) pero es decisión de scope que se toma una vez en Paso 21 (roadmap).
