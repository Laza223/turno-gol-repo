# Findings Previos — Auditoría de Documentación TurnoGol

> Consolidación de las 4 sesiones de auditoría realizadas por Opus 4.7 sobre los 20 documentos de TurnoGol.

---

# SESIÓN 1: Auditoría Forense — Capa de Negocio (docs 1-5, 9, 10)

Leí los 7 documentos completos. Dejo aclaraciones de contexto antes de entrar al análisis:

- Los docs 6, 7 y 8 se referencian pero no están incluidos (Doc 9 cita "Doc 7 Flujos 10-12" y "Doc 8 Epic SAS"; Doc 10 cita "Doc 7 Flujo 1" y "Doc 8 Epic ONB-001 a 005"). Parte de mis hallazgos serían mitigables si esos docs existen. Si no existen, es gap de planeación. Lo marco como Issue #0.
- Usé los docs 3, 4 y 5 desde el filesystem; el prompt me los pasó como adjuntos pero no venían en el bloque `<documents>`.

Lo demás es crítica directa.

---

## 1. CONSISTENCIA INTERNA — Contradicciones reales entre documentos

### 1.1 Máquina de estados del tenant: dos versiones incompatibles [DOC 4 vs DOC 9] — BLOQUEANTE

Este es el problema más grave de los 7 docs. Los diagramas de lifecycle no coinciden en estados, transiciones ni timings.

- Doc 4, §2 define 6 estados: `trial, active, past_due, suspended, canceled, churned`.
- Doc 9, §1 define 8 estados: `TRIALING, ACTIVE, PAST_DUE, SUSPENDED, CANCELED, BLOCKED, CHURNED, DELETED`.

Los estados `BLOCKED` y `DELETED` existen solo en Doc 9. Doc 4 colapsa `BLOCKED` dentro de `SUSPENDED` y no contempla `DELETED` como estado separado.

**Transiciones incompatibles:**

| Evento | Doc 4 dice | Doc 9 dice |
|---|---|---|
| Trial termina sin pagar | trial → churned (directo) | TRIALING → BLOCKED → CHURNED (pasando por BLOCKED con 90 días de gracia) |
| Acceso el día 31 post-trial | "Solo lectura" (§3, día 31) | "Sin acceso" (BLOCKED) |
| Cobro falla → churn | Día 21 (§4) | Día 90 (§4 timeline) |
| Eliminación de datos | Día 90 (§4) | Día 97 (§4 timeline) |

**Impacto:** Cualquier implementación correcta respecto de uno de los docs será buggy respecto del otro. El middleware de tenant.status, los jobs de dunning, las comunicaciones automáticas y los triggers de retention se arquitecturan distinto según cuál se tome como verdad. El equipo técnico va a quedar pidiendo aclaración constantemente.

### 1.2 Timeline de dunning inconsistente [DOC 4 vs DOC 9] — ALTA

- Doc 4, §4: "Día 0 falla → Día 2 (2do intento) → Día 4 (3er intento) → Día 7 SUSPENDED → Día 14 advertencia → Día 21 CHURNED → Día 90 eliminación".
- Doc 9, §4: "DÍA 0 FALLA → retry DÍA 2 → retry DÍA 5 → DÍA 7 SUSPENDIDO → DÍA 14 BLOQUEADO → DÍA 90 CHURNED → DÍA 97 BORRADO".

Tres divergencias numéricas:

- Tercer reintento: día 4 vs día 5
- Churn: día 21 vs día 90
- Eliminación: día 90 vs día 97

**Impacto:** El cron job que transiciona estados tiene que tener un timing único. Si se implementa con Doc 4, los clientes serán churneados 69 días antes que lo que el runbook de retención (Doc 9 §4) asume. Los mails "Tus datos se eliminan en 39 días" (Doc 4 §4, día 51) no computan: Doc 4 dice datos archivados desde día 21, entonces día 51 serían 39 días antes de los 90... pero el mensaje dice "se eliminan en 39 días" que implicaría día 90. Hay que revisar aritmética del propio Doc 4.

### 1.3 Descuento anual: 25% vs 33% [DOC 4 §1 vs DOC 9 §2 vs DOC 2] — ALTA

- Doc 4, §1 tabla: Starter mensual $55.000 / anual $41.000 → ahorro real = 25,45% (confirmado por texto "Descuento 25% anual" en §9).
- Doc 9, §2: literal — "Precio anual (33% off)".
- Doc 2 sobre ATC: "Descuento ~33% por pago anual".

**Impacto:** Doc 9 parece haber copiado el descuento de ATC sin validar contra el pricing de TurnoGol en Doc 4. Si esto va a landing/checkout, habrá clientes que vean "33% off" en un lugar y paguen un anual con 25% de ahorro real. Fricción legal y de confianza.

### 1.4 Nombres de planes incompatibles [DOC 4 vs DOC 9] — ALTA

- Doc 4, §1: Starter / Pro / Full
- Doc 9, §2: Básico / Estándar / Full

Solo "Full" coincide. Esto sugiere que los docs fueron escritos en momentos distintos por personas distintas sin merge.

**Impacto:** todos los links, copies, pricing pages, tests E2E, y eventos de analytics van a romper al cambiar nombres. Si alguno ya está publicado, migrar nombres de plan es dolor real.

### 1.5 Cronograma de notificaciones de trial diferente en tres docs [DOC 4 §3 vs DOC 9 §3 vs DOC 10 §5] — MEDIA

| Día | Doc 4 §3 | Doc 9 §3 | Doc 10 §5 |
|---|---|---|---|
| 0/1 | WA+Email bienvenida | WA+Email bienvenida | WA+Email bienvenida |
| 7 | Email tips | WA auto "¿ayuda?" | — |
| 14 | WA humano proactivo | Email automático | — |
| 21 | WA+Email recordatorio | WA+Email | — |
| 25 | Email feedback | — (no existe) | — |
| 28 | WA humano (ventas) | WA+llamada humano | — |
| 30 | WA+Email "último día" | WA+Email | — |
| 31 | Bloqueo + WA | Email "prueba terminó" | — |
| 37 | Email win-back 20% off | — (no existe) | — |

Doc 4 tiene días 25 y 37 (feedback + win-back) que Doc 9 no documenta. Doc 10 tiene una secuencia genérica que no matchea a ninguno.

**Impacto:** el equipo de growth no sabe cuántos mensajes programar ni cuándo. El costo de WA cambia ±40% según cuál secuencia se implemente.

### 1.6 "Solo lectura" post-trial vs bloqueo total [DOC 4 §3 vs DOC 9 §1] — ALTA

- Doc 4 §3: "Día 31 → Acceso bloqueado (solo lectura)".
- Doc 9 §1 diagrama: TRIALING → BLOCKED (y BLOCKED se define como "sin acceso").

**Impacto:** si Marcelo al día 40 quiere exportar sus datos para irse, en Doc 4 puede hacerlo; en Doc 9 no tiene acceso. Esto cruza con Doc 5 RBAC y Doc 9 §5 ("Exportación de datos: Sí (CSV)") — contradicción de acceso a features post-expiración.

### 1.7 Trial post-churn: 90 días [DOC 4] vs 90 días post-bloqueo [DOC 9] — MEDIA

Doc 4 cuenta 90 días desde churn (día 21 post-falla). Doc 9 cuenta 90 días desde BLOCKED (día 14 post-falla). Son días calendáricos distintos. Afecta al flow de reactivación y al `scheduled_deletion_at`.

### 1.8 Localización del "abonado" en el modelo [DOC 3 vs DOC 5] — MEDIA

Doc 3 declara explícitamente que "El abonado NO es un tipo de usuario diferenciado. Es un jugador (Persona 3) que tiene un acuerdo comercial de turno fijo con un complejo específico."

Doc 5 §5 lista entre las tablas con tenant_id: "subscriptions (abonados/turnos fijos)", y entre las tablas globales: "players — un jugador puede reservar en varios complejos".

Modelo correcto (inferible): una tabla subscriptions con `(tenant_id, player_id, court_id, day_of_week, ...)`. Pero nunca se define explícitamente la relación player ↔ tenant. No hay tabla `player_tenant_relationships` mencionada, y sin ella no se puede implementar:

- Lista negra de jugadores por complejo
- Historial de no-shows por complejo
- "Mis complejos favoritos" del jugador
- Datos que ve el tenant del jugador (email, teléfono) — ¿antes o después del primer booking? ¿con consentimiento?

### 1.9 Horarios en el wizard vs Doc 5 §8 timezone [DOC 10 §2 vs DOC 5 §8] — BAJA

Doc 10 §2 paso 3 muestra horarios "00:00", "01:00" (es decir, cierra "al día siguiente"). Doc 5 §8 dice "todos los timestamps se almacenan en UTC". Un horario "cierra lunes 01:00" en ART (UTC-3) es "lunes 04:00 UTC". El wizard no aclara si el horario ingresado es "hora local del complejo" o algo más. Dato menor pero ambiguo.

---

## 2. LÓGICA DE NEGOCIO

### 2.1 ¿Dónde está el flujo de cobro de SEÑAS? — BLOQUEANTE

Doc 1 define el no-show como "dolor de mayor impacto económico" (§2, Dolor B). Doc 2 lista "Señas con MercadoPago" como tabla stakes. Pero en 7 docs:

- Doc 4 solo habla de MP Suscripciones (cobro del SaaS al tenant).
- Ningún doc describe el flujo MP Checkout que cobra la seña del jugador al complejo.
- Ningún doc define: % de seña (solo menciona "default 30%" como pasada en Doc 10), política de reembolso, split payments (¿MP le cobra al jugador y le deposita al tenant? ¿TurnoGol intermedia?), captura parcial, manejo de contracargos.

**Impacto:** el feature estrella del value proposition (eliminar no-shows) no tiene especificación. Esto es un hueco en la capa de negocio, no un detalle técnico.

### 2.2 Cobro automático de abonados: diferenciador sin modelo económico — BLOQUEANTE

Doc 2 lista "Cobro automático abonados" como la ventaja más importante vs ATC. Doc 4 lo menciona como incluido en todos los planes. Pero:

- ¿TurnoGol cobra al jugador y le transfiere al tenant? Entonces TurnoGol queda en medio del flujo de dinero (implica PSP/cuenta escrow/comisión).
- ¿O TurnoGol solo gatilla el cobro en la cuenta MP del tenant? Entonces depende de que el tenant tenga MP Suscripciones propio contratado (no solo Checkout).
- ¿Quién paga la comisión de MP sobre el abono? 2,99% (Doc 4 §10) sobre $28.000 = $837 por abonado/mes. Con 15 abonados = $12.555/mes. ¿Se descuenta del abonado? ¿Del tenant? ¿TurnoGol lo absorbe?

Ninguno de los 7 docs responde esto. El feature diferenciador v1 carece de modelo de flujo de fondos.

### 2.3 MP Suscripciones para tenant: limitación real en Argentina — ALTA

Doc 4 §7 asume que MP Suscripciones funciona sin problemas. Realidad operativa:

- MP Suscripciones en AR requiere tarjeta de crédito (no débito) en la mayoría de los flujos.
- Muchos dueños de complejos chicos no tienen tarjeta de crédito empresarial.
- No se contempla el fallback (¿debin? ¿pago manual mensual?).

Si el 30% de los tenants no puede contratar MP Suscripciones, el modelo no funciona para ellos.

### 2.4 Inflación y plan anual con precio lockeado — ALTA

Doc 4 §5 reconoce el problema pero la "estrategia" lo admite: "El precio no cambia hasta que renueve" para clientes anuales, combinado con "Revisar precios cada 3 meses dado el IPC argentino".

Con IPC anualizado en AR históricamente entre 100-250%, un cliente que pagó anual en enero termina pagando en términos reales ~45% menos en diciembre. Doc 4 ofrece 25% de descuento anual y asume que el 20-30% de los clientes elige anual (Doc 4 §10 no lo modela pero el descuento sugiere que lo esperan). Resultado: para esos clientes, TurnoGol pierde plata durante ~6-9 meses por cada anual vendido si la inflación supera ~40%.

Mitigaciones no exploradas en ningún doc: cláusula de ajuste por CER/IPC, precio en USD con conversión al momento de cobro, plan anual con ajuste trimestral pero 10% off (en vez de 25%).

### 2.5 Costos de WhatsApp masivamente subestimados — BLOQUEANTE

Doc 4 §10: "WhatsApp Business API: ~$50.000-100.000 ARS/mes (según volumen)".

Hagamos la cuenta con los propios números de los docs:

- 200 complejos (Doc 5 §1 target) × 10 turnos/día (Doc 5 §1) × 4 canchas = 8.000 turnos/día.
- Por turno: 1 WA de confirmación + 1 WA de recordatorio 24hs = 2 conversations/turno.
- Total: 16.000 conversations/día → 480.000/mes.
- Meta en AR (2025-2026) cobra en el rango de US$0,03–0,07 por business-initiated conversation utility/marketing.
- Costo estimado: 480.000 × $0,05 = US$24.000/mes ≈ $28.000.000 ARS/mes a tipo de cambio actual.

Esto es ~300x el rango estimado en Doc 4. Aun si contamos solo utility conversations (más barato) y solo eventos críticos (señas + abonos + bienvenida, no recordatorios), el número está 30-50x subestimado.

**Impacto:** si este feature es tabla stakes (y lo es — Doc 2 lo confirma), el modelo de unit economics en Doc 4 §10 es falso. MRR $7.630.000 menos WA $28.000.000 = operación deficitaria.

**Recomendación:** validar pricing real de WA API en AR con Meta directo o un BSP (Twilio, WATI, Infobip), y posiblemente usar templates de free-tier + recordatorios solo a contactos que iniciaron (user-initiated es gratis).

### 2.6 Onboarding 20 min self-service vs Marcelo tech 2.5/5 — ALTA

Tensión real entre:

- Doc 3 Persona 1: Marcelo, 43 años, tech literacy 2.5/5, "tiene miedo a tocar algo y romper todo", "nunca va a leer un manual", "se frustra rápido si algo no es intuitivo".
- Doc 10 §4: "4 pasos × 85% retención = 52% completa el wizard". Esto es un supuesto ("85% retención por paso"), no un dato validado.

Contraste:

- Doc 2 §debilidad 4: "ATC onboarding 1-7 días" es considerado debilidad. Pero ATC tiene 1-7 días porque el mercado lo necesita, no por torpeza.
- Marcelo de 43 con tech 2.5 probablemente va a: abrir el wizard, ver "dirección", dudar si poner CUIT o dirección comercial, llamar al hijo, abandonar, volver mañana. La "retención 85% por paso" es wishful thinking sin validación con 10 Marcelos reales.

**Recomendación:** complementar el self-service con una opción de "onboarding asistido" (like a concierge 30-min call en Day 1) para reducir abandono en el segmento que más paga (Full, 7+ canchas).

### 2.7 Edge case: cambio de plan a mitad de ciclo con abonados activos

Pregunta del prompt ("¿qué pasa si un complejo cambia de plan a mitad de ciclo?") — parcialmente cubierta:

- Doc 4 §6 cubre upgrade (prorrateo) y downgrade (inicio próximo período, con bloqueo si excede canchas del plan menor).
- No cubre: qué pasa con los abonados activos en el cambio. Si el tenant baja de Pro a Starter, desactiva cancha 4, pero tenía 3 abonados en cancha 4 con cobros recurrentes MP programados. ¿Se cancelan? ¿Se migran? ¿Se paran los cobros?
- No cubre: downgrade con partidos abiertos ya publicados en canchas que se desactivan.
- No cubre: bajar al plan "Starter" perdiendo acceso a "reportes avanzados" — si Marcelo ya había configurado dashboards personalizados, ¿qué pasa con la config?

### 2.8 Cancelación voluntaria: ¿quién reembolsa? — ALTA

Doc 9 §5 al cancelar: "Cancelar Partidos Abiertos pendientes → reembolsar participantes". Pero:

- Los partidos abiertos se pagaron con MP al tenant (si hay señas).
- Si el tenant ya no tiene cuenta activa, ¿cómo se hace el refund automático?
- ¿TurnoGol asume el costo del refund? Riesgo legal y económico.

### 2.9 Estado "suspended = solo lectura" crea crisis para clientes finales — ALTA

Doc 4 §2: suspended permite "ver datos pero no operar". Pero si Marcelo está suspended y sus 15 abonados esperan jugar el viernes, el sistema no puede:

- Emitir recordatorios
- Procesar cobros automáticos de abonos
- Permitir al jugador cancelar su instancia de abono

Los damnificados no son Marcelo (el deudor), son los jugadores (terceros). Generar fricción ahí destruye la confianza en el marketplace. No hay política documentada.

### 2.10 RNF "target 500 complejos" con equipo de 1-3 personas — MEDIA

- Doc 5 §1: "Diseñar para 500 complejos", 24.000 turnos/día, 100.000 jugadores B2C.
- Doc 5 §2: p95 de 500-2000ms en operaciones críticas.
- Doc 5 §3: 99,5% uptime, ventanas de mantenimiento, runbook, failover a réplica.
- Doc 5 §7: backups cross-región, test mensual de restore, zero-downtime deploys.

Para un equipo de 1-3 personas Y1 (implícito en memory + en "monolito managed"), cumplir simultáneamente todo esto es optimista:

- Test de restore mensual requiere staging mantenido + disciplina.
- Read replica para failover cuesta infra extra + complejidad de código.
- Zero-downtime deploys son posibles (Railway/Fly lo hacen) pero requieren migraciones backward-compatible disciplinadas.
- Monitoreo con alertas < 2min requiere Sentry + uptime robot + on-call (¿quién atiende un viernes 22hs?).

**Conclusión:** los RNFs son correctos para el negocio pero exceden la capacidad de un equipo de 1-3 en los primeros 6 meses. Priorizar: 99,5% uptime y RLS son indispensables; read replica y test de restore mensual son v2.

---

## 3. PERSONAS Y JTBD

### 3.1 Actor faltante: el contador / administrativo — ALTA

Doc 5 §4 habla de "Datos de facturación del dueño | Para emisión de recibos". Pero nadie usa esos datos en las personas. Marcelo no liquida impuestos — Doc 1 lo confirma: "No tiene contador propio: usa una liquidación mensual básica o lo hace 'a ojo'". Pero un complejo de 6 canchas facturando $3M/mes sí tiene un contador externo.

Jobs del contador no cubiertos: exportar caja mensual en formato contable, cruzar cobros MP vs registros del sistema, obtener retenciones aplicadas, generar reportes para presentación a AFIP.

### 3.2 Actor faltante: soporte interno de TurnoGol — MEDIA

Doc 4 §3 día 28: "llamada/mensaje humano del team de ventas". Doc 4 §8: soporte prioritario por plan. No hay persona 5 para quien hace ese outreach. Sus necesidades: ver panel interno de todos los tenants, filtrar trials en día 28 sin primera reserva, registrar resultado de llamada, disparar playbooks. Sin persona ni jobs definidos, no hay producto interno, y al mes 2 el team de ventas va a pedir un CRM.

### 3.3 Abonado como persona: decisión polémica — MEDIA

Doc 3 argumenta que abonado = jugador con contrato. Defensible a nivel de modelo de datos. Pero los JTBD son distintos:

| Dimensión | Tomás espontáneo | Tomás abonado |
|---|---|---|
| Frecuencia de uso | Baja (buscar cancha) | Cero (todo automático) |
| Miedo dominante | "No conseguir cancha" | "Me cobran sin haber jugado" |
| Decisión dominante | ¿Cuál complejo? | ¿Cancelo mi abono? |
| Métrica de éxito | Tiempo a reserva | Ausencia de sorpresas |

Colapsar ambos en una sola persona enmascara que los dos modos requieren features casi disjuntos. La Sección "Lo que lo haría abandonar" para el abonado no existe en Doc 3 (solo para Marcelo). **Sugerencia:** mantener una sola persona pero duplicar la sección de JTBD/miedos/métricas por modo.

### 3.4 Priorización de JTBD: dolor primario no está como JTBD primario — MEDIA

Doc 1 §2 es categórico: "el no-show es el dolor de mayor impacto económico directo".
Doc 3 Persona 1 JTBD primario: "confirmar y cobrar un turno en menos de 20 segundos desde el celu" — esto ataca Dolor A (caos de reservas), no Dolor B (no-show).

Ningún JTBD de Marcelo menciona: "quiero evitar los no-shows", "quiero cobrar seña para garantizar el turno". Está implícito como "cobrar" pero no como prioridad. Si el no-show es Dolor #1, el JTBD primario debería reflejarlo.

### 3.5 Encargado Rodrigo: su persona no tiene proceso de alta/baja — MEDIA

Doc 3 describe a Rodrigo como crítico para adopción. Doc 5 RBAC lo contempla. Pero:

- ¿Cómo Marcelo le da acceso? (Invitación por email, teléfono, código?)
- Si Rodrigo renuncia, ¿cómo se le saca el acceso? ¿Marcelo acuerda "voy a desactivar tu usuario"?
- Si Rodrigo cambia de trabajo, ¿su historial de acciones queda con su nombre (audit logs mantienen actor_id)?
- ¿Se puede tener 2 recepcionistas simultáneos (Rodrigo y Fernanda)? Doc 4 §8 dice "Starter = 2 staff" — entra, pero ¿en la UI hay gestión?

### 3.6 Persona Lucas (organizador): volumen real cuestionable — BAJA

Doc 3 Persona 4: "% de organizadores que publican más de 1 partido por mes: > 50%". Esta métrica presupone que hay organizadores en suficiente volumen para que estadísticamente signifique algo. En v1 con 50-200 complejos, puede haber 20 organizadores totales. Target "50% publica +1/mes" = 10 personas. El feature "partidos abiertos" es técnicamente caro (cola de cancelación, split de cobro, chat interno) para un segmento pequeño. Sospecho que este feature está sobreindexado en v1 y debería postergarse a v1.5.

---

## 4. RIESGOS ARGENTINA

### 4.1 Retenciones y facturación con MP / AFIP — ALTA

Ningún doc menciona:

- Retenciones automáticas de MP: IIBB (varía por provincia, 2-5%), Ganancias (0,5-6%), IVA (dependiendo si es Monotributo o Responsable Inscripto).
- Monotributistas vs Responsables Inscriptos: un tenant Monotributo con factura mensual >$X obligada a cambiar categoría. TurnoGol puede gatillar eso sin querer.
- Facturación electrónica obligatoria al jugador: si el complejo cobra seña online, debe emitir factura. ¿Lo hace manual? ¿TurnoGol integra con AFIP (WSFEv1)? Si no, es feature faltante grave.
- TurnoGol como emisor hacia el tenant: la suscripción SaaS tributa IVA 21% — ¿los precios son IVA in o IVA out? Doc 4 no aclara.

### 4.2 Dependencia de MercadoPago — ALTA

- Doc 5 §10 contempla "MP checkout caído → sin seña" como graceful degradation. Pero no contempla: MP Suscripciones caído durante el día de facturación global del SaaS (1° del mes) genera masa de cobros fallidos que entran a dunning erróneamente.
- Comisiones sobre señas (2,99%) erosionan el ticket del complejo. No se define quién paga la comisión. Si el complejo cobra seña $2.400 (30% de $8.000), pierde $72 por seña. Con 500 señas/mes = $36.000/mes en comisiones. Debería documentarse qué ve el dueño como "costo del sistema".
- Contracargos y disputas: ausentes en todos los docs. Si un jugador reclama ante MP que "reservé y no me dieron la cancha", el tenant pierde el dinero + comisión. TurnoGol debería tener audit trail específico (pero Doc 5 §6 no lista "pago disputado").

### 4.3 WhatsApp API: ya cubierto en 2.5 (BLOQUEANTE)

### 4.4 Adopción de Marcelo 43 años tech 2.5/5: ya cubierto en 2.6

### 4.5 Conectividad del mostrador — MEDIA

Doc 5 §8 aborda conectividad móvil variable. Edge case no cubierto: el complejo con WiFi cayendo 20 veces/hora (muy común en complejos de GBA/interior). El formulario de reserva guarda en localStorage (§8), bien, pero:

- La grilla de disponibilidad en tiempo real requiere refrescos. Si hay pérdida de conexión, ¿se muestran datos stale como si fueran actuales? Riesgo de doble-booking aceptado por grilla desactualizada.
- No hay offline mode (§11 lo declara out-of-scope "complejidad innecesaria para v1"). Pero si el encargado carga una reserva offline y al volver la conexión hay conflicto, ¿qué hace la UI? Sin spec.

### 4.6 Estacionalidad fútbol argentino — BAJA

No mencionado en ningún doc:

- Enero-febrero: 40-50% caída de ocupación (vacaciones, calor intenso).
- Marzo-noviembre: pico.
- Diciembre-enero mundial (cada 4 años) o Copa América: pico extremo.

Impacto en el modelo:

- Churn estacional de tenants: muchos complejos pagan SaaS mensual y lo cancelan en enero.
- Cobro de abonados: muchos abonados pausan en enero. Doc 9 §5 no menciona "pausar abono".
- Proyección de MRR Doc 4 §10 asume constante; real es estacional.

---

## 5. GAPS — Todo lo que falta

### 5.1 Facturación electrónica AFIP — BLOQUEANTE legal
Obligación de emitir factura en ventas B2C digitales. Ningún doc cubre integración WSFEv1, tipos de comprobante, puntos de venta. Para Year 1 es feature de MVP sí o sí, o TurnoGol queda como intermediario legalmente expuesto.

### 5.2 Flujo de señas MP Checkout — BLOQUEANTE
Ya cubierto en 2.1.

### 5.3 Flujo de cobro automático de abonados (quién cobra, quién recibe, comisiones) — BLOQUEANTE
Ya cubierto en 2.2.

### 5.4 Importador de datos desde ATC / CSV — ALTA
Doc 2 lo menciona como pilar estratégico anti-switching-cost. Ningún doc define: formato aceptado, columnas requeridas, validación, mapeo, manejo de errores, rollback, preview antes de importar.

### 5.5 Gestión de gastos — ALTA
Doc 2 posicionamiento tabla lista "Gestión de gastos" como diferenciador TurnoGol vs ATC. Ningún doc define categorías, flujos, integración con caja. Es feature prometido sin spec.

### 5.6 Política de privacidad / Ley 25.326 (Datos Personales Argentina) — ALTA
Doc 5 §4 habla de seguridad pero no de:
- Consent flows al registrarse (jugador + tenant).
- Derecho al olvido (¿cómo se elimina data de un player que lo pide? Borrar filas afecta historial del tenant).
- Registro ante la AAIP.
- DPA con terceros (MP, Meta/WhatsApp, proveedores de email).
- Data residency (¿hosting en Argentina, EEUU, EU?).

### 5.7 Disputa de pago / chargeback — ALTA
Mencionado en Doc 5 §6 solo indirectamente ("retención 12 meses para disputas"). Flujo concreto ausente: cómo se notifica la disputa al tenant, qué evidencia se provee a MP, quién absorbe el costo.

### 5.8 Política de cancelación de reservas y señas — ALTA
Doc 10 §2 paso 4 menciona "política de cancelación (default 12hs)". Pero en los 7 docs no está definido:
- ¿Qué pasa con la seña si cancela con +12hs? ¿Se reembolsa 100%?
- ¿Con -12hs? ¿Se pierde 100%?
- Tabla de escenarios (lluvia, cancha rota, cierre por COVID) no está.

### 5.9 Feriados y excepciones de horario — MEDIA
Doc 10 explícitamente saca feriados del wizard. Ningún doc define el modelo post-wizard. Feriados argentinos son ~15/año. Complejos a veces abren, a veces no, a veces con precio diferencial. Modelado complejo que no aparece en datos entities.

### 5.10 Roadmap de v1 / MVP shipping plan — ALTA
Doc 1 §6 dice qué está out-of-scope. Nada dice qué features entran en v1 first release vs qué va en 1.1, 1.2, 1.3. Con 2-3 personas no se puede construir todo simultáneamente. Sin priorización explícita, el equipo va a construir features paralelamente sin terminar ninguna.

### 5.11 Analytics / instrumentación de producto — MEDIA
Métricas de Doc 9 §7 (MRR, churn, conversion) requieren instrumentación específica. Ningún doc define: qué herramienta (PostHog, Mixpanel, Amplitude), qué eventos trackear, privacy considerations (PII en event properties), dashboards internos de growth.

### 5.12 Estrategia de adquisición B2C (jugadores) — MEDIA
Doc 2 reconoce que ATC gana en marketplace establecido. Doc 1 §7 plantea TurnoGol como marketplace en el value prop B2C. Sin estrategia de adquisición B2C (¿SEO por ciudad? ¿ASO? ¿Instagram Ads? ¿programa de referidos?), el feature B2C no tiene tracción.

### 5.13 SLA de soporte y playbooks — MEDIA
Doc 4 §8 tabla: "Soporte: Email / Email+WA / WA dedicado". Ningún doc define tiempo de respuesta, escalation, horario de atención, cómo se gestiona. Marcelo vs ATC elige en parte por soporte — prometer "WA dedicado" sin backbone es riesgo de NPS.

### 5.14 Observabilidad / runbooks operacionales — MEDIA
Doc 5 §3 menciona runbook pero sin contenido. Doc 5 §7 habla de backups/restore. No hay runbook para: MP webhooks acumulados, WA queue atrasada, cancha bloqueada permanentemente por transacción fantasma, player duplicado, tenant en estado inválido.

### 5.15 Internacionalización (fuera de v1 pero arquitectónicamente presente) — BAJA
Doc 5 §8 previene timezone para futura expansión LATAM, pero no hay i18n strategy: formatos de moneda (ARS vs CLP vs PEN), idioma (es-AR usa "vos", otros "tú"), localización de contenido (términos como "seña" no existen en Chile/Perú).

### 5.16 Moderación de partidos abiertos — MEDIA
Si Lucas (Persona 4) publica un partido con descripción ofensiva, o el grupo resulta conflictivo, ¿qué herramientas tiene el admin del complejo (Marcelo) para controlar? ¿Bloquear jugadores? ¿Reportar? Doc 3 menciona "lista de participantes" pero no moderación.

### 5.17 Organigrama / estructura del equipo TurnoGol — BAJA
Docs parten del supuesto de "1-3 personas" pero sin división de roles, responsabilidades o procesos para escalar a 5-10 en 12-18 meses.

### 5.18 Pricing modificado por canal — BAJA
Doc 4 §3 día 37 menciona "win-back con 20% off primer mes". No hay spec de: cupones, promo codes, pricing por canal de adquisición, attribution para comisionar vendedores.

### 5.19 Onboarding del recepcionista / invitar staff — MEDIA
Doc 10 se enfoca en Marcelo (admin). El wizard no cubre "invitar al encargado". Doc 3 dice Rodrigo es crítico. Falta: flow de invitación, email a Rodrigo, su onboarding propio (distinto al de Marcelo — no configura el complejo).

### 5.20 Notificaciones al jugador: opt-in y preferencias — MEDIA
Doc 3 Persona 3 miedo: "Me llegan demasiadas notificaciones". Doc 4 no menciona preference center. Sin opt-in granular (recordatorio sí, promo no, etc.), el jugador silencia el canal → pierde info crítica → aumenta no-shows.

### 5.21 Accesibilidad (a11y) — BAJA
Doc 5 §11 se llama "Accesibilidad y Performance Mobile-First" pero solo habla de performance. WCAG no está mencionado. Para v1 quizás no es crítico, pero es un deuda técnica creciente.

### 5.22 ¿Qué son los docs 6, 7, 8? — ALTA
Referenciados en Doc 9 y Doc 10. Si no existen, son gaps de planificación (flujos detallados + epics + user stories). Si existen, el scope de la auditoría está incompleto. Cualquier issue que aparentemente sea gap de estos 7 docs podría estar cubierto ahí.

---

## Tabla consolidada de issues — Sesión 1

| ID | Doc(s) | Descripción | Severidad | Acción recomendada |
|---|---|---|---|---|
| 0 | N/A | Docs 6, 7, 8 referenciados pero ausentes del review | ALTA | Confirmar si existen; si no, escribirlos antes de construir. |
| 1 | DOC 4 §2 vs DOC 9 §1 | Máquina de estados tenant incompatible (6 vs 8 estados, transiciones distintas) | BLOQUEANTE | Consolidar en un solo diagrama autoritativo y deprecar el otro. |
| 2 | DOC 4 §4 vs DOC 9 §4 | Timeline de dunning difiere en día 4/5, día 21/90 churn, día 90/97 deletion | ALTA | Unificar timeline único y corregir aritmética interna de Doc 4 §3 (día 51 + 39 ≠ día 90). |
| 3 | DOC 4 §1 vs DOC 9 §2 | Descuento anual 25% (Doc 4) vs 33% (Doc 9) | ALTA | Decidir % único y corregir una tabla; validar contra unit economics con inflación. |
| 4 | DOC 4 vs DOC 9 | Nombres de planes Starter/Pro/Full (Doc 4) vs Básico/Estándar/Full (Doc 9) | ALTA | Elegir nombres canónicos y reemplazar en todo el material. |
| 5 | DOC 4 §3 vs DOC 9 §3 vs DOC 10 §5 | Tres cronogramas de notificaciones de trial distintos | MEDIA | Unificar en un solo calendar con canal, tipo (auto/humano) y trigger. |
| 6 | DOC 4 §3 vs DOC 9 §1 | "Solo lectura" post-trial vs "sin acceso" (BLOCKED) | ALTA | Definir si post-trial hay ventana de solo lectura o bloqueo directo. |
| 7 | DOC 3 vs DOC 5 §5 | Relación player ↔ tenant no modelada explícitamente | ALTA | Definir tabla intermedia player_tenant_relationships con campos (status, bookings_count, noshow_count, blocked_at). |
| 8 | DOC 1, 2 | Flujo de cobro de SEÑAS con MP Checkout no existe en ningún doc | BLOQUEANTE | Escribir spec de flujo seña: %, política, reembolso, captura, webhooks. |
| 9 | DOC 2, 4 | Cobro automático de abonados carece de modelo de flujo de fondos | BLOQUEANTE | Definir: ¿TurnoGol intermedia o gatilla? ¿Quién paga la comisión MP? ¿Feature requiere MP Suscripciones propio del tenant? |
| 10 | DOC 4 §10 | Estimación de costo de WhatsApp API subestimada ~30-300x | BLOQUEANTE | Recalcular con volumen real (480k conversations/mes @ 200 tenants), negociar con BSP, rediseñar para maximizar user-initiated / templates gratuitos. |
| 11 | DOC 4 §5 | Plan anual con inflación 100%+ destruye margen en términos reales | ALTA | Eliminar anual plain; reemplazar con "anual con cláusula de ajuste" o quitar descuento a 10%. |
| 12 | DOC 4 §7 | Asume MP Suscripciones disponible; requiere tarjeta crédito (no todos la tienen) | ALTA | Documentar fallback: DEBIN, pago manual mensual vía link MP Checkout. |
| 13 | DOC 3, 10 | Onboarding self-service 20 min choca con Marcelo tech 2.5/5 | ALTA | Agregar opción "onboarding asistido 30 min con humano" para plan Pro/Full; medir con 10 tenants piloto. |
| 14 | DOC 4 §6 | Upgrade/downgrade no cubre qué pasa con abonados y partidos abiertos activos | ALTA | Agregar sección "Efectos cascada de cambio de plan". |
| 15 | DOC 9 §5 | Cancelación voluntaria dispara refunds a participantes sin definir responsable | ALTA | Definir: el refund se gatilla contra la cuenta MP del tenant (idealmente antes de desconectar); si no hay fondos, TurnoGol no cubre. |
| 16 | DOC 4 §2 | Tenant "suspended" crea crisis para sus 15 abonados sin política | ALTA | Durante suspended: seguir emitiendo recordatorios a jugadores pero sin cobrar; pausar abonos; notificar a jugadores del estado del complejo. |
| 17 | DOC 5 §1, 2, 3, 7 | RNFs combinados (99,5%, read replica, test restore mensual, zero-downtime) exceden capacidad de equipo 1-3 | MEDIA | Priorizar: RLS + 99,5% son v1; read replica + restore mensual son v1.5. |
| 18 | N/A | Facturación electrónica AFIP (WSFEv1) no documentada | BLOQUEANTE legal | Evaluar si TurnoGol es emisor o solo facilitador; integrar con AFIP o partner (Tango, Xubio API). |
| 19 | N/A | Retenciones MP (IIBB, Ganancias, IVA) no documentadas | ALTA | Agregar sección "Tributario argentino" al doc de monetización. |
| 20 | DOC 2 | Importador de datos ATC/CSV mencionado pero sin spec | ALTA | Spec de columnas, validación, preview, rollback. |
| 21 | DOC 2 | "Gestión de gastos" prometida como diferenciador sin spec | ALTA | Escribir spec o removerla del posicionamiento. |
| 22 | N/A | Política de privacidad / Ley 25.326 ausente | ALTA | Redactar consent flows, política de retención, DPA con terceros, registro AAIP. |
| 23 | N/A | Política de cancelación de reservas/señas con escenarios (lluvia, etc.) ausente | ALTA | Definir matriz de escenarios × tiempo × % reembolso, incluyendo override del tenant. |
| 24 | N/A | Persona "contador del complejo" no existe | ALTA | Agregar Persona 5 con JTBD de exportación contable. |
| 25 | DOC 3 | Jobs-to-be-done primario de Marcelo no refleja Dolor #1 (no-show) | MEDIA | Revisar JTBD primario: agregar o reordenar para que incluya "eliminar no-shows". |
| 26 | DOC 3 | Abonado como persona colapsada con jugador espontáneo oculta JTBD divergentes | MEDIA | Mantener persona única pero duplicar sección JTBD / miedos / métricas por modo. |
| 27 | DOC 3 | Persona Rodrigo sin flow de alta/baja ni audit de acciones históricas | MEDIA | Agregar user story de "invitar staff" + spec de qué pasa con actor_id al desactivar usuario. |
| 28 | DOC 3 | Sin "Persona 5: Team interno de TurnoGol" (support/sales/growth) | MEDIA | Crear persona y panel interno para outreach y escalamiento. |
| 29 | N/A | Estacionalidad fútbol AR (enero -50%, mundial +pico) ignorada en proyección MRR | MEDIA | Rehacer Doc 4 §10 con estacionalidad + política de "pausar abono". |
| 30 | DOC 10 | Feriados excluidos del wizard pero nunca modelados | MEDIA | Agregar sección "Calendario y excepciones" en roadmap post-wizard. |
| 31 | N/A | Roadmap/MVP priorizado ausente | ALTA | Escribir doc "v1.0 scope" explícito con criterios de corte (must/should/won't). |
| 32 | DOC 3 | Partidos abiertos (Persona 4) sobreindexados para v1 dado volumen esperado | BAJA | Evaluar postergar a v1.5 y priorizar marketplace simple + abonados + señas. |
| 33 | DOC 4 §7 | Webhooks de seña de jugador no documentados (solo suscripción SaaS) | ALTA | Agregar tabla de webhooks MP Checkout y su manejo idempotente. |
| 34 | N/A | Disputas / chargebacks no documentadas | ALTA | Flujo: notificación al tenant, evidencia a MP, quién absorbe costo. |
| 35 | N/A | Analytics / instrumentación de producto ausente | MEDIA | Elegir herramienta (PostHog recomendado) y definir eventos core. |
| 36 | DOC 2 | Estrategia B2C de adquisición de jugadores ausente | MEDIA | Definir SEO por ciudad, ASO PWA, referidos, IG/Google Ads. |
| 37 | DOC 4 §8 | SLA de soporte mencionado pero sin respuestas, escalation ni horario | MEDIA | Redactar SLA por plan y cómo se opera con equipo chico. |
| 38 | DOC 3 miedos | Sin preference center de notificaciones → riesgo de silenciado masivo | MEDIA | Agregar opt-in granular (recordatorios / abono / promo) por jugador. |
| 39 | DOC 5 §4 | Magic link de 15 min muy corto para Marcelo tech 2.5/5 | BAJA | Extender a 60 min o implementar "reenviar con 1 click". |
| 40 | DOC 5 §11 | Section "Accesibilidad" solo habla de performance; WCAG ausente | BAJA | Incluir baseline WCAG 2.1 AA para v1.5. |
| 41 | DOC 5 §10 | Graceful degradation cubre caída momentánea pero no caída prolongada de MP Suscripciones en día 1° de facturación global | MEDIA | Agregar circuit breaker + retries exponenciales + notificación proactiva al tenant. |
| 42 | N/A | Moderación de partidos abiertos ausente (Persona 4) | MEDIA | Si partidos abiertos entra v1: reporte, bloqueo, review por admin complejo. |
| 43 | DOC 4 §1 | Precios no aclaran si son IVA in o IVA out | MEDIA | Definir y reflejar en landing + checkout. |

**Mi lectura global:** los docs tienen pensamiento estratégico sólido (Doc 1 y 2 son buenos), pero la capa de monetización/lifecycle (Doc 4 + Doc 9) está escrita en dos momentos distintos y no se hizo merge — esto es la raíz de ~40% de las inconsistencias. El foco siguiente debería ser: (a) unificar Doc 4 y Doc 9 en un único spec autoritativo; (b) escribir los docs de señas, abonos y facturación AFIP que simplemente no existen; (c) validar el número de costos WA con Meta/BSP antes de cerrar pricing.

---
---

# SESIÓN 2: Auditoría de coherencia — Capa Funcional (docs 6, 7, 8)

Hice el análisis cruzado entre las tres fuentes. Abajo va el veredicto por sección y al final una tabla de issues priorizados. La conclusión general: los documentos están bien alineados en la columna vertebral del producto (reservas, abonados, dunning), pero tienen huecos sistemáticos en entidades auxiliares, transiciones de estado y edge cases financieros — los típicos lugares donde un SaaS B2B se rompe en producción.

---

## 1. Entidades vs. Flujos

### Entidades listadas pero no definidas como sección

En el doc6, la tabla final "Guía Directa al Schema de DB" lista 19 tablas, pero solo 13 tienen sección ENTIDAD X completa. Quedaron sin definir explícitamente:

- **Plan** — referenciada como FK en TenantSubscription.plan_id y usada intensivamente en Flujo 10 ("Plan Básico 1-3 canchas / Estándar 4-6 / Full 7+"). Sin schema, el desarrollador va a inventar los campos (max_courts, monthly_price, annual_price, features?). Bloqueante para implementar el Flujo 10.
- **AuditLog** — aparece en cada flujo como efecto secundario ("📊 AuditLog: booking.created"), pero no está la forma de la tabla. ¿Qué campos tiene? ¿actor_type, actor_id, entity_type, entity_id, event, before_state, after_state, metadata, occurred_at? Sin esto, la trazabilidad es papel.
- **TenantPlayerBan** — usada en Flujo 4D ("tenant_player_bans: ban_until = NOW() + penalty.days"). Sin schema.
- **ProcessedWebhook** — mencionada en Flujo 2 paso 5 para idempotencia y en US-RES-003 notas. Crítica para MP. Sin schema.
- **PriceVersion** — orfanato total: aparece en la tabla del doc6 y no se usa en ningún flujo ni user story. O se agrega propósito o se saca.
- **DailyCashClose** (o como se llame) — Flujo 9 paso 4 dice "Crear registro de cierre de caja" con ~8 campos específicos (total ingresos/egresos/balance, efectivo contable declarado, diferencia, nota, cerrado por). Entidad completamente omitida en doc6.

### Campos que los flujos exigen pero doc6 no define

- **Credenciales de MercadoPago del Tenant:** Flujo 1 paso 6 dice "guardar MP credentials del complejo" pero Tenant.settings (JSONB) no las incluye ni hay columnas dedicadas (mp_access_token, mp_refresh_token, mp_public_key, mp_user_id). El OAuth de MP requiere guardar al menos access + refresh token encriptados.
- **TenantSubscription.pending_plan_change:** definido en doc6 pero ningún flujo lo usa. US-SAS-004 (upgrade/downgrade) dice "el cambio se aplica al PRÓXIMO período" para downgrades — ese es exactamente el propósito del campo, pero nadie lo escribe ni lo lee explícitamente.
- **Fecha de ciclo del abonado:** Flujo 6 dice cobro "a inicio de mes (o en la fecha de ciclo definida)" pero el Abonado no tiene un campo `billing_cycle_day`.

### State machines: estados huérfanos y transiciones faltantes

**Booking:** la máquina dibujada es correcta, pero:
- US-CAN-003 edge case dice "Si la reserva era pending_payment → el admin la puede cancelar (se pasa a expired, no a cancelled)". Esa transición `pending_payment → expired` por acción de admin no está en la state machine del doc6, que solo contempla expiración por timeout.
- `type = 'event'` existe como enum pero no hay flujo dedicado a crear/gestionar eventos. Si es solo una etiqueta para reservas manuales, está OK; si implica otro comportamiento, falta el flujo.

**Tenant:** la máquina del doc6 es incompleta frente a lo que describen los flujos:
- Falta el estado intermedio "trial vencido, bloqueado, recuperable". Flujo 10 dice "El trial ya venció (día 31+) → El complejo está en modo 'bloqueado' (solo lectura)". El doc6 salta directo de TRIAL a CHURNED el día 31, lo cual es inconsistente con los 90 días de retención post-trial.
- La transición TRIAL → CANCELED (dueño cancela durante trial — edge case de US-SAS-005) no figura en el diagrama.

**Court:** inconsistencia directa doc6 ↔ doc8:
- Doc6 state machine: ACTIVE ↔ INACTIVE (dos estados).
- US-ADM-001 criterio de aceptación: "puedo editar... estado (active/maintenance/inactive)" — tres estados.
- US-ADM-001 edge case: "pongo una cancha en maintenance". El estado `maintenance` no existe en doc6. Hay que decidir: o se agrega al enum y a la máquina, o se saca del user story.

**Abonado:** la transición PAUSED → CANCELLED no está dibujada en doc6 (solo aparece ACTIVE → PAUSED, ACTIVE → CANCELLED), pero US-ABO-005 edge case la exige explícitamente: "Si cancelo un abonado que ya estaba pausado → cambia de paused a cancelled".

**MatchParticipant:** la máquina del doc6 muestra:
- JOINED → CONFIRMED, JOINED → REFUNDED, JOINED → NO_SHOW

Pero semánticamente un NO_SHOW solo puede ocurrir después de que el partido se confirmó. Debería ser CONFIRMED → NO_SHOW, no JOINED → NO_SHOW. Y falta la transición CONFIRMED → REFUNDED (cuando el admin cancela post-quórum, Flujo 8 variante admin).

**Player:** el estado `suspended` del enum ('active' | 'banned' | 'suspended') nunca se setea en ningún flujo. Huérfano.

**Payment y TenantSubscription:** doc6 lista los enums de status pero no dibuja state machines. Las transiciones aparecen dispersas en los flujos. Para dos entidades tan críticas, merece diagramas explícitos.

---

## 2. Flujos vs. User Stories

### Flujos con cobertura completa en user stories
Flujos 1–12 están todos mapeados a al menos una US. No hay flujos huérfanos.

### User Stories que describen funcionalidad NO cubierta en doc7

Hay un grupo grande de stories que apuntan a "Doc 6, Entidad X" en vez de un flujo — operaciones CRUD de configuración que el doc7 dio por obvias pero que tienen decisiones no triviales:

- **US-ADM-001** (CRUD canchas): sin flujo. Edge case crítico no resuelto: "Si desactivo una cancha con reservas futuras → warning: 'Hay {N} reservas futuras. Se cancelarán automáticamente.'" — ¿qué flujo orquesta esa cancelación masiva? ¿4C por cada reserva? ¿Hay reembolsos?
- **US-ADM-002** (transformables): sin flujo. ¿Qué pasa si rompo la relación madre-hija mientras hay bookings activos que dependen del bloqueo cruzado?
- **US-ADM-003** (políticas): sin flujo. Edge case más delicado: "Si desactivo requires_deposit y ya hay reservas en pending_payment → esas reservas se confirman automáticamente". Nadie modeló qué pasa con los timers ni con los pagos que pudieran llegar después.
- **US-ADM-004** (staff): sin flujo. El edge case "El único admin se desactiva → error" requiere una validación invariante en DB, no solo en UI.
- **US-ADM-005 / US-CAJ-004** (productos y ventas): hay US pero ningún flujo en doc7 describe la venta. Y es un flujo con efectos colaterales reales (CashFlow, decremento de stock, categoría product_sale).
- **US-ADM-006** (horarios y feriados): sin flujo. Edge case: "Si un abonado tiene turno en un día que se marca como cerrado → la instancia de esa semana no se genera". Pero ¿qué pasa con las instancias ya generadas para ese día si el feriado se agrega después? El flujo 5 generó 8 semanas; si agrego un feriado dentro de esas 8 semanas, nadie borra la instancia.
- **US-SAS-004** (upgrade/downgrade): dice "Flujo 10 (derivado)" pero el flujo 10 habla solo de conversión trial→paga, no de cambios entre planes pagos. El prorrateo, el uso de pending_plan_change, la gestión de price_locked_until en upgrades anuales — todo eso no está modelado en ningún flujo.

**Recomendación:** agregar al menos Flujos 13–15 al doc7 (Admin gestiona configuración; Venta de producto; Upgrade/Downgrade con prorrateo).

### Inconsistencias Given/When/Then vs. pasos del flujo

- **US-CAN-001** edge case: "Si la seña fue pagada en efectivo (reserva manual) → no hay reembolso automático. Mostrar: 'Contactá al complejo para el reembolso de tu seña.'" — Esto no está en Flujo 4A. El flujo asume refund por MP siempre. Caso real: seña en efectivo es común en AR y el flujo no lo contempla.
- **US-RES-007** edge case: "Si el admin quiere cambiar un completed a no_show → permitido SI está dentro de las 24hs. Después de 24hs → inmutable." — Doc6 dice que completed y no_show son "estados finales inmutables" sin excepciones. Doc7 Flujo 4D no menciona ventana de 24h. Tres documentos, tres reglas distintas.
- **US-SAS-002** prioridad: header dice P0, tabla de resumen del final del doc8 (línea 2066) la pone en P3. Mismo problema con US-SAS-005 (header P0, tabla P3). Inconsistencia interna del propio doc8 — afecta sprint planning.
- **US-CAN-003** edge case sobre pending_payment cancelado por admin — ya mencionado arriba, queda flotando entre expired y cancelled.

### Personas: desalineación con el premise

Mencionaste que hay 4 personas y que "Abonado NO es una persona separada — es un estado del jugador". Pero el doc8 trata a Agustín (Abonado) como una 5ta persona protagonista en US-CAN-001, US-RES-006, US-JUG-002, y la tabla de cross-reference persona→stories. Si la decisión de producto es que Agustín = Tomás con un turno fijo asignado desde el admin, entonces:

- No debería haber flujos de autoservicio diferenciados para él.
- US-JUG-002 "Mis Reservas" mostrándole un "Turno fijo" con color distintivo sigue siendo válido (es solo UI diferencial), pero la persona en el header debería ser Tomás.
- Consolidar a Agustín dentro de Tomás simplifica el modelo y evita que alguien construya features pensando en una persona que no existe.

---

## 3. Edge cases sin cubrir (por flujo)

### Concurrencia — el gran agujero transversal

- **SELECT FOR UPDATE sobre qué exactamente.** Doc7 Flujos 2 y 3 dicen "SELECT FOR UPDATE en la cancha (lock exclusivo)". Si el lock es sobre courts.id, serializa todas las reservas de esa cancha, lo cual en un complejo con pico de tráfico los viernes 19hs es un problema de rendimiento. Lo correcto sería un lock por rango (exclusion constraint de PostgreSQL, btree_gist) que doc6 invariante 1 menciona pero nunca define. Dev va a implementar lo fácil y es incorrecto.
- **Dos webhooks de MP aprobados para la misma reserva.** Teóricamente imposible, pero pasan duplicados. processed_webhooks está mencionada pero sin schema claro.
- **Canchas transformables con reservas simultáneas** (Flujo 2): si una request intenta reservar Cancha Grande y otra request intenta Cancha A al mismo milisegundo, ¿ambas bloquean la cancha madre con SELECT FOR UPDATE? Invariante de exclusión tiene que cubrir parent_court_id también.
- **Quórum de OpenMatch** (Flujo 7 paso 6): dos pagos aprobados en los últimos dos spots del mismo partido. ¿Qué pasa si ambos webhooks llegan y confirmed_spots == total_spots + 1? El contador tiene que ser atómico y debe haber un check-constraint `confirmed_spots <= total_spots`.

### Pagos parciales o fallidos

- **Refunds parciales de MP:** MP a veces devuelve menos monto del solicitado (por comisiones ya cobradas o por tipo de cambio si fue internacional). Ningún flujo modela refund_partial. Payment.type solo tiene 'refund', sin monto distinto.
- **MP en estado in_process persistente** (transferencia bancaria vía CBU). Flujo 2 lo menciona pero no dice cuánto tiempo espera antes de timeout. El timer de 15 min sigue corriendo mientras MP todavía procesa la transferencia que puede tardar 24-48hs. Si el timer expira, la reserva se pierde y el pago eventualmente se aprueba → problema real.
- **Pago aprobado llega 20 min después del timeout.** Flujo 2 edge case dice "el pago se reembolsa automáticamente". Pero ¿quién dispara ese refund? El webhook handler al ver el booking ya en expired. ¿Y si el refund de MP falla (el lado del jugador tiene cuenta bloqueada)? Cadena de fallos no modelada.
- **Comisiones de MP en los CashFlow:** el dinero que entra por MP no es lo que cobró el jugador (MP descuenta ~5-7% de comisión). Los CashFlows de Flujo 9 asumen que income = monto cobrado, pero la conciliación contable real necesita trackear el neto vs. el bruto. No hay campo fees ni net_amount en Payment.

### Cancelaciones en cadena

- **Tenant cancela con abonados pagos del mes:** Flujo 12 paso 5 cancela los abonados activos y notifica. Pero si un abonado pagó el día 1 vía auto_mp y el tenant cancela el día 20 del mismo mes, el abonado no recibe reembolso proporcional (doc7 Flujo 6 edge case #6 dice "el admin gestiona privadamente"). Esto es un problema legal en AR (defensa del consumidor). Hay que explicitar quién asume el costo.
- **Cancelación de cancha con abonados activos** (US-ADM-001 edge case): el warning dice "Cancelalos primero" pero no hay flujo de cancelación masiva de abonados que dispare WA a todos, cancele las suscripciones de MP, y limpie instancias futuras en una transacción.
- **OpenMatch confirmado que termina cancelado** (Flujo 8 variante B post-quórum): si el partido ya tiene Booking creado, hay que cancelar el Booking y refundar a participantes y liberar slot. ¿En qué orden? ¿Qué pasa si el Booking se cancela pero algún refund falla? Atomicidad no modelada.
- **Pausa de abonado** (Flujo 5/6): elimina instancias futuras. Pero si ya hubo cobro del mes (día 1) y el admin pausa el día 15, las instancias del 16 al 30 desaparecen y la plata ya entró. Flujo no dice si hay crédito, reembolso proporcional, ni cómo se refleja en caja.

### Cambios de precio a mitad de abonado vigente

No está modelado en ningún flujo. Doc6 dice que Abonado.price_per_session es un campo propio, pero no dice si es inmutable o editable. Escenarios:

- Admin quiere subir el precio desde el mes siguiente. ¿Edita directamente? ¿Se guarda histórico?
- El costo energético sube y todos los abonados deberían pagar más. ¿Operación bulk? ¿Notificación obligatoria?
- Court.pricing cambia pero abonado mantiene precio viejo — correcto, pero el Abonado tendría que tener price_locked_at o un PriceVersion (que justamente está orfanada en doc6).

Cambio de precio del plan SaaS a mitad de ciclo: US-SAS-004 menciona price_locked_until para anuales, pero no qué pasa con monthly si hay aumento. ¿Se aplica en la próxima renovación? ¿Hay notificación 30 días antes (requerido por Ley 26.993 en AR)?

### Otros edge cases por flujo

- **Flujo 1:** OAuth de MP donde el dueño es admin de múltiples cuentas MP y elige la equivocada. No hay flujo de "desvincular y reconectar".
- **Flujo 3:** retroactive booking (US-RES-002) — price_snapshot usa el precio de ahora o el histórico del momento del turno? Si los precios subieron, el admin podría estar cobrando de más sin querer.
- **Flujo 4D:** auto-complete a los 30 min asume completed. Pero si el recepcionista cerró la caja del día y después se da cuenta de que fue no-show (cliente lo llamó al día siguiente), US-RES-007 le da 24h pero Flujo 9 congela los CashFlows al cerrar caja. Conflicto entre la ventana de 24h de corrección y la inmutabilidad del cierre de caja.
- **Flujo 9:** webhook de MP llegando durante el cierre en progreso. Race condition si el cierre es una transacción larga.
- **Flujo 10:** trial que se convierte el día 15 — el texto dice "el primer período empieza HOY". OK, pero ¿qué pasa con los 15 días del trial que "se pierden"? Nada en el modelo captura esto.
- **Flujo 11:** tenant suspendido con abonados auto_mp — el cobro a los abonados sigue funcionando porque está en MP directamente. El tenant sigue recibiendo plata mientras está "bloqueado". ¿Cuál es la política? No está definida.

---

## 4. Ambigüedades

Cosas que dos desarrolladores van a interpretar distinto:

- **Tenant.status vs Tenant.subscription_status vs TenantSubscription.status.** Tres fuentes de verdad para lo mismo. Doc6 las muestra las tres, pero no dice cuál es autoritativa ni cómo se sincronizan. En Flujo 11 día 7 se actualiza solo TenantSubscription.status → 'suspended' — ¿el Tenant queda en active? ¿Se deriva? Un dev va a poner lógica en uno y otro en otro y van a divergir.
- **Booking.deposit_status = 'captured' vs Payment.status = 'approved'.** Flujo 4B dice que al cancelar fuera de plazo, deposit_status pasa a 'captured' pero el Payment subyacente queda como 'approved'. Son conceptos distintos: uno financiero (el pago está aprobado), otro contable (ahora el dinero es de la casa, no del cliente). Pero el nombre del enum no lo deja claro.
- **Doble contabilización de seña capturada.** Flujo 4B dice: "Seña capturada → CashFlow: income". Pero esa seña ya entró como income el día del pago original. Si la registramos de nuevo en el día de la cancelación, el total del mes estará inflado. Política contable ambigua.
- **Cancellation policy en el boundary** (`NOW() < date + time_start - hours_before` vs `>=`): en el segundo exacto del umbral, ¿refund o no? Formalmente está resuelto a favor de "sin reembolso" en el empate, pero no hay nota explícita.
- **"Reserva retroactiva"** (US-RES-002 edge case): permitido si date = hoy y time_start ya pasó. Pero doc6 invariante 5 dice "date debe ser mayor o igual a hoy al crear". Técnicamente consistente, pero complejo cuando el complejo cierra a las 2am.
- **"Máximo 1 nivel de anidamiento"** (doc6 invariante 2 de Court). ¿Solo madre y hijas (2 niveles totales)? ¿O madre puede ser hija de otra madre (3 niveles)? La redacción permite ambas lecturas.
- **Ban global del jugador:** Player.status = 'banned' implica global, pero no está definido cuándo se setea. US-CAN-004 dice "NO incluye ban global automático por no-shows cross-tenant". Entonces Player.status = 'banned' es efectivamente un estado muerto en v1.
- **mp_subscription_id** aparece en Abonado y en TenantSubscription. Son MP subscriptions distintas en cuentas MP distintas. Se presta a confusión.
- **El organizador del OpenMatch siempre es un participante** (Flujo 7 paso 2). Pero Flujo 8 edge case #5 dice "Si el partido tiene 0 participantes al deadline → se cancela sin reembolsos". Contradicción lógica.
- **Comisión de MercadoPago:** no se menciona en ningún lado. Es el 5-7% que MP cobra por transacción. Sin modelar esto, la caja del complejo estará sistemáticamente inflada.
- **Horarios operativos cruzando medianoche:** ¿Cómo se representa un complejo que abre 20:00 y cierra 02:00 del día siguiente? No está definido. En AR es común.
- **Feriado agregado después de generar instancias de abonado:** tres implementaciones posibles: (a) ignorar, (b) cancelar automáticamente, (c) avisar al admin.

---

## Tabla de issues — Sesión 2

| ID | Doc(s) | Descripción | Severidad | Acción recomendada |
|---|---|---|---|---|
| I-01 | doc6 | Entidad Plan listada en la tabla final pero sin sección definida con campos | Crítica | Agregar sección con name, max_courts, monthly_price, annual_price, mp_plan_id_monthly, mp_plan_id_annual, features (JSONB) |
| I-02 | doc6, doc7 | Entidad DailyCashClose completamente omitida, pero el Flujo 9 paso 4 la crea con 8 campos específicos | Crítica | Agregar entidad con campos mínimos: tenant_id, date, total_income, total_expense, balance, declared_cash, diff_amount, note, closed_by, closed_at |
| I-03 | doc6 | Entidades AuditLog, TenantPlayerBan, ProcessedWebhook listadas pero sin schema | Crítica | Definir las tres con atributos explícitos. AuditLog es la que más urge. |
| I-04 | doc6 | Tenant no tiene campos para credenciales OAuth de MercadoPago, pero Flujo 1 paso 6 las guarda | Crítica | Agregar mp_access_token, mp_refresh_token, mp_user_id, mp_public_key, mp_connected_at, todos encriptados at-rest |
| I-05 | doc6 | PriceVersion aparece en la tabla pero nunca se usa | Media | O se elimina, o se define y se agrega a los flujos que justifican su existencia |
| I-06 | doc6, doc8 | Court state machine tiene 2 estados pero US-ADM-001 habla de 3 (active/maintenance/inactive) | Alta | Decidir: agregar maintenance al enum y a la state machine, o eliminarlo del user story |
| I-07 | doc6, doc7 | Tenant state machine no contempla "trial vencido, bloqueado, recuperable" | Alta | Redibujar state machine con estado intermedio trial_expired o similar |
| I-08 | doc6 | Transición Abonado: PAUSED → CANCELLED no dibujada pero usada en US-ABO-005 | Media | Actualizar diagrama del Abonado |
| I-09 | doc6 | MatchParticipant: JOINED → NO_SHOW semánticamente incorrecto; falta CONFIRMED → REFUNDED | Alta | Redibujar state machine alineada con la realidad |
| I-10 | doc6 | Payment y TenantSubscription no tienen state machine explícita | Media | Agregar diagramas explícitos |
| I-11 | doc6 | Player.status = 'suspended' es estado huérfano | Baja | O se saca del enum, o se define en qué flujo se activa |
| I-12 | doc6, doc7 | Tres fuentes para el estado de suscripción: Tenant.status, Tenant.subscription_status, TenantSubscription.status | Alta | Definir cuál es la fuente de verdad y documentar sincronización |
| I-13 | doc7, doc8 | No hay Flujo E2E para CRUD de canchas, staff, productos, políticas, horarios, transformables | Alta | Agregar Flujos 13-15 al doc7 |
| I-14 | doc8 | US-SAS-002 y US-SAS-005 tienen prioridad contradictoria entre header (P0) y tabla resumen (P3) | Media | Corregir tabla resumen |
| I-15 | doc8 | Persona "Agustín (Abonado)" se trata como 5ta persona, contradiciendo el premise | Media | Consolidar Agustín dentro de Tomás |
| I-16 | doc6, doc7, doc8 | Ventana de 24h para corregir completed → no_show contradice la inmutabilidad de doc6 y no aparece en Flujo 4D | Alta | Decidir política y documentar en las tres fuentes |
| I-17 | doc7 | Flujo 4A asume siempre refund por MP; no cubre seña pagada en efectivo | Alta | Agregar variante 4A-efectivo |
| I-18 | doc6, doc7 | SELECT FOR UPDATE sobre courts.id serializa toda la cancha y mata la concurrencia real | Crítica | Usar exclusion constraint con btree_gist en vez de lock a nivel cancha |
| I-19 | doc7 | No hay modelado de comisiones de MercadoPago en Payment ni CashFlow | Alta | Agregar campos fees y net_amount a Payment |
| I-20 | doc7 | Timer de 15 min no contempla pagos "in_process" por CBU/transferencia (24-48hs) | Alta | Separar timeout de "checkout abandonado" de "pago pendiente de acreditación" |
| I-21 | doc7 | Tenant cancela con abonados pagos del mes — sin política de reembolso proporcional | Alta | Definir quién asume el costo. Documentar en Flujo 12 |
| I-22 | doc7 | Cambios de precio en abonado vigente — sin flujo ni política | Alta | Definir si price_per_session es editable, cómo se notifica, plazo mínimo |
| I-23 | doc7 | Feriado agregado después de generar instancias — sin definir qué pasa con las ya creadas | Media | Definir política: cancelación automática vs. opción manual |
| I-24 | doc7 | Cierre de caja vs. ventana de corrección de no-show: conflicto de inmutabilidad | Alta | Correcciones post-cierre generan CashFlow compensatorios, no editan los del pasado |
| I-25 | doc7 | Cobro de abonado auto_mp sigue funcionando con Tenant suspendido | Media | Definir política |
| I-26 | doc6 | Booking.deposit_status = 'captured' semánticamente confuso | Baja | Renombrar o documentar explícitamente |
| I-27 | doc6 | Horarios operativos que cruzan medianoche no están modelados | Media | Definir convención |
| I-28 | doc7 | Organizador siempre participante, pero Flujo 8 edge #5 habla de 0 participantes | Baja | Eliminar edge imposible o permitir que organizador se salga |
| I-29 | doc6, doc7 | Webhook handler idempotencia: processed_webhooks sin schema ni TTL | Alta | Definir tabla con mp_payment_id, received_at, processed_at, raw_payload. TTL 90 días |
| I-30 | doc6 | Booking.type = 'event' en enum pero sin flujo dedicado | Baja | Eliminar o documentar propósito |
| I-31 | doc7 | Refunds parciales de MP no modelados | Media | Agregar campo amount_refunded en Payment |

**Próximo paso natural:** tomar los ~8 issues críticos (I-01, I-02, I-03, I-04, I-16, I-18, I-20, I-29) y refinarlos hasta que el schema de Drizzle sea 1:1 con doc6 sin que el dev tenga que inventar nada.

---
---

# SESIÓN 3: Auditoría Técnica — Capa Técnica (docs 11-15)

Hice una lectura completa de los 5 documentos. Son de muy buena calidad, especialmente doc12 (la argumentación de las 6 capas de seguridad y el manejo del jugador cross-tenant está bien pensada) y doc13 (los triggers de inmutabilidad y la exclusion constraint son decisiones maduras). Dicho eso, hay problemas de coherencia y algunos riesgos concretos.

---

## 1. Schema (doc13)

**Lo que está bien.** El SQL es, en términos generales, ejecutable. La exclusion constraint de bookings con btree_gist está bien formada. Los triggers de prevent_immutable_booking_changes y prevent_price_snapshot_change son el tipo de defensa de invariantes que la mayoría de los SaaS no tienen. Los índices compuestos respetan la regla de "tenant_id primero" y cubren los queries dominantes.

**Lo que no cierra:**

- **Inconsistencia de ortografía en los ENUMs.** booking_status usa `cancelled_refunded` / `cancelled_no_refund` (inglés británico, doble L) pero tenant_status y subscription_status usan `canceled` (inglés americano, una L). abonado_status también usa `cancelled`. Esto va a causar bugs de string matching. Elegí una y unificá todo el schema.
- **La exclusion constraint no cubre canchas transformables.** La constraint previene overlap en la misma court_id. Pero madre e hija tienen court_id distintos. El trigger check_transformable_court_availability cubre en modo BEFORE, pero sin lock → race condition real entre transacciones concurrentes. Necesitás SELECT FOR UPDATE sobre las filas de courts relacionadas dentro de la transacción, o una exclusion constraint más sofisticada.
- **Faltan CHECK constraints para invariantes del booking_type.** El schema no fuerza que `type='block'` implique `player_id IS NULL`, que `type='fixed'` implique `abonado_id IS NOT NULL`, ni que `type='open_match'` implique una relación con open_matches. Un bug en el service layer puede crear bookings inconsistentes sin que la DB los rechace.
- **Inconsistencia de nombres en processed_webhooks.** ADR-004 (doc11) usa `received_at`, doc13 usa `processed_at`.
- **Falta índice en payments.mp_preference_id.** Los webhooks de MP buscan por este campo → full scan con 1.2M filas/año.
- **Falta índice en open_matches.deadline_at** para el cron que cancela partidos sin quórum.
- **match_participants.tenant_id puede desincronizarse** de open_matches.tenant_id. Nada enforza la igualdad.

---

## 2. Tenant Isolation (doc12 vs doc13)

Las 13 tablas coinciden. El stack de 6 capas está bien argumentado.

### 🚨 Problema grave #1: RLS vs endpoints de jugador

Las policies usan únicamente `current_setting('app.current_tenant_id', true)::UUID`. Doc12 §4.1 dice explícitamente que para requests de jugador NO se setea `app.current_tenant_id`. Entonces, cuando el jugador consulta `SELECT * FROM bookings WHERE player_id = X`, el policy evalúa `tenant_id = NULL::UUID → NULL → fila descartada`. **El jugador no puede ver NADA de sus propias reservas.**

Opciones reales:

- **A:** Usar service role para las queries del jugador + filtrar por player_id siempre. Riesgoso.
- **B (recomendado):** Setear `app.current_player_id` en el middleware y agregar a cada policy:

```sql
USING (
    tenant_id = current_setting('app.current_tenant_id', true)::UUID
    OR player_id = current_setting('app.current_player_id', true)::UUID
)
```

- **C:** Policies separadas por rol usando `Supabase auth.jwt()`.

**Esto hay que resolverlo antes de escribir código, porque cambia todas las policies.**

### 🚨 Problema grave #2: Realtime no respeta current_setting

Supabase Realtime usa la sesión del cliente (JWT), no la variable de sesión del backend. Las policies de doc13 solo chequean `current_setting`. Hay que duplicar cada policy:

```sql
CREATE POLICY tenant_isolation_select ON bookings FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id', true)::UUID
    OR tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::UUID
  );
```

### Problemas menores

- **tenants no tiene RLS.** Un staff ve feature_overrides y trial_ends_at de otros complejos.
- **staff_users no tiene RLS.** Un admin ve emails de todo el personal de todos los complejos.
- **SET LOCAL con Drizzle + pooling es un campo minado.** Cada request debe envolverse en `db.transaction()` para que SET LOCAL no se pierda.

---

## 3. API Contracts (doc15) vs Schema + ADRs

Coherencia general buena. Los 78 endpoints mapean a entidades existentes.

**Endpoints faltantes críticos:**

- No hay `POST /api/matches` (crear partido abierto).
- No hay endpoints de `tenant_player_bans`.
- No hay `POST /api/auth/switch-tenant`.
- `POST /api/bookings` acepta player_name + player_phone sin player_id — ¿dónde aterrizan?
- `POST /api/cash-flows` sin payload documentado.
- `POST /api/onboarding/register` no menciona slug.
- Falta endpoint para completar perfil de jugador post-OAuth.

---

## 4. ADRs (doc11) vs Implementación (doc14)

### 🚨 Contradicción importante: pg-boss + Vercel

ADR-005 elige pg-boss. ADR-009 elige Vercel + Supabase ("zero operaciones de servidor"). Doc14 §8.3 confiesa que no encajan:

> "pg-boss en Vercel serverless tiene una limitación... Solución para v1: correr el worker en un servicio separado (Railway, Fly.io, o un VPS de $5/mes)."

Ninguna de las dos ADRs menciona este tercer vendor. Necesita nueva ADR o actualización de ADR-005.

### Otros problemas

- **Supabase Realtime:** ADR-006 calcula 1.000-1.500 conexiones pero plan Pro solo soporta 500. Costos estimados en doc14 no reflejan esto.
- **Drizzle + PgBouncer:** modo transaction es incompatible con prepared statements; hay que configurar `prepare: false`. No está en doc14.

---

## 5. Over-engineering para v1

Equipo de 1-3 personas, meta realista Y1 de 50-100 complejos. Diferibles:

- Marketplace de partidos abiertos (open_matches + match_participants) → v1.1
- audit_logs con before_state + after_state JSONB completos → empezar minimalista
- price_versions → código muerto hasta que cambien precios
- tenant_player_bans → ~0-5 bans esperados en primeros 50 complejos
- tenant_staff_members como tabla separada M:N → empezar 1:1
- feature_overrides por tenant → "beta testers van al plan Pro gratis"
- Canchas transformables (parent_court_id + trigger) → ~5-10% de los complejos

**Empezar con ~11 tablas core** cubre ~80% de los flujos.

---

## 6. Riesgos técnicos

- **SELECT FOR UPDATE no previene gap inserts.** La exclusion constraint es indispensable como red de seguridad. Service layer debe manejar SQLSTATE 23P01.
- **pg-boss sin worker persistente.** Mayor riesgo operativo del stack.
- **Webhook de MP antes de que exista el booking.** El handler debe buscar por external_reference con retry.
- **Realtime con RLS mal configurado** = no recibe eventos o recibe todos.
- **Supabase Pooler + SET LOCAL.** Cualquier query SIN transacción explícita pierde el contexto.
- **Cold starts de Vercel.** ~100-300ms de conexión a Supabase impacta target de grilla < 500ms.
- **Audit logs sin particionado.** ~10-20GB al año 2.
- **Data retention y Ley 25.326.** No hay endpoint de "quiero que borren mis datos ahora" (derecho ARCO).

---

## Tabla de issues — Sesión 3

| ID | Doc(s) | Descripción | Severidad | Acción recomendada |
|---|---|---|---|---|
| 1 | 12, 13 | Policies RLS solo evalúan current_setting; jugador no ve sus reservas | Crítica | Agregar app.current_player_id y extender cada policy |
| 2 | 12, 13 | Supabase Realtime usa JWT, no current_setting → filtro por tenant no aplica | Crítica | Duplicar cada policy con cláusula OR auth.jwt() |
| 3 | 11, 14 | pg-boss + Vercel incompatibles sin worker externo | Crítica | Nueva ADR: elegir entre worker en Railway, Vercel Cron, o reemplazar pg-boss |
| 4 | 13, 14 | Canchas transformables: trigger tiene TOCTOU race condition | Alta | SELECT FOR UPDATE sobre courts madre+hijas en la transacción |
| 5 | 14 | Drizzle + Supabase pooler: SET LOCAL se pierde sin db.transaction() | Alta | Wrapper obligatorio withTenantContext(fn) + lint rule |
| 6 | 13 | ENUMs mezclan cancelled con canceled | Alta | Unificar a canceled (inglés americano) |
| 7 | 11, 15 | ADR-006: Realtime excede plan Pro de Supabase (500 concurrent) | Alta | Validar límite; presupuestar Team plan o pooling client-side |
| 8 | 13 | Falta índice en payments.mp_preference_id | Alta | CREATE INDEX con filtro WHERE NOT NULL |
| 9 | 13 | No hay CHECK constraints para invariantes de booking_type | Media | Agregar CHECK expressions o trigger de validación |
| 10 | 12, 13 | Tabla tenants sin RLS: staff lee feature_overrides de otros complejos | Media | Policy USING (id = current_setting...) |
| 11 | 12, 13 | Tabla staff_users sin RLS: admin ve emails de todos los complejos | Media | Policy vía join con tenant_staff_members |
| 12 | 13 | match_participants.tenant_id puede desincronizarse | Media | Trigger o generated column |
| 13 | 15 | Faltan endpoints: crear partido, bans, switch-tenant, cash-flows | Media | Completar el contract |
| 14 | 15 | POST /api/bookings acepta player_name+phone sin definir qué pasa | Media | Decidir explícitamente y documentar |
| 15 | 14 | SELECT FOR UPDATE no previene gap inserts; service layer debe atrapar 23P01 | Media | Handler explícito de error |
| 16 | 15 | Webhook de MP puede llegar antes de que exista booking.payment_id | Media | Handler busca por external_reference con backoff |
| 17 | 13 | Exclusion constraint fea y no escalable a reservas cruzando medianoche | Baja | Considerar tstzrange |
| 18 | 11, 13 | Inconsistencia received_at (ADR) vs processed_at (schema) | Baja | Elegir uno y unificar |
| 19 | 13 | audit_logs con JSONB va a pesar ~10-20GB al año 2 | Baja | Particionado por mes desde la migration inicial |
| 20 | Global | Sobre-ingeniería: open_matches, bans, price_versions, etc. son diferibles | Baja | Shippear v1 con ~11 tablas core |

**Veredicto:** Los documentos reflejan pensamiento arquitectónico maduro. Pero hay 3 issues críticos que bloquean el arranque limpio: RLS incompleto para jugadores (#1), RLS incompleto para Realtime (#2), y la contradicción pg-boss/Vercel (#3). Los tres se resuelven en 2-3 días de trabajo arquitectónico antes de escribir código.

---
---

# SESIÓN 4: Review de la Capa de Calidad y Operaciones (docs 16-20)

Revisé los 5 documentos en secuencia. Son sólidos, bien razonados y con criterio operativo poco común para un proyecto Year 1. La mayoría de mis observaciones son sobre cosas que faltan, no sobre errores de lo que está.

---

## 1. TESTING (doc16)

### La pirámide 65/25/10 es realista

Con Next.js + PostgreSQL + webhooks externos, el 25% de integration es incluso bajo. No cambiaría los números, pero calibraría expectativas: los integration tests van a tomar más tiempo de lo que sugiere el 25%.

### 200 tests para 12 flujos E2E — hay una inconsistencia

El documento lista 7 E2E tests, no 12. Los que faltan:
- Gestión de staff (invitar, cambiar rol, revocar)
- Modo degradado (MP down → reserva se crea igual)
- Flujo de reembolso parcial dentro de política
- Dunning flow visible (past_due → pago → active)
- Transformable courts desde la UI

~200 tests es suficiente para 7 E2E, no 12.

### Isolation tests como BLOQUEANTE: correcto, no excesivo

No negociable para SaaS multi-tenant. Un data leak termina el negocio.

**Sugerencia:** agregar check automático de que toda tabla con tenant_id está en ISOLATED_TABLES:

```sql
SELECT table_name FROM information_schema.columns 
WHERE column_name = 'tenant_id' AND table_schema = 'public'
```

### Tests críticos que faltan

1. **Tests de carga** (MISSING — alto riesgo). Script k6/artillery con 100 reservas concurrentes al mismo slot.
2. **Tests contra MP sandbox** (MISSING — medio riesgo). Smoke test semanal contra sandbox de MP.
3. **Tests de migrations** (MISSING — alto riesgo). Verificar idempotencia, rollback, y timing sobre datos production-sized.
4. **Tests de RLS con JWT real**, no solo SET LOCAL.
5. **Timezone/DST edge cases.** Boundary tests de medianoche ART.
6. **Security smoke tests.** SQL injection, XSS, rate limit (~5 tests).

---

## 2. OBSERVABILIDAD (doc17)

### Métricas técnicas bien; negocio sin alertas

Las métricas se recolectan y no se alertan. Agregar:
- 0 bookings en ventana de 60 min entre 18:00-23:00 ART un viernes/sábado
- past_due_tenants crece >X en una semana
- Tasa de booking.conflict > 5%

### Alertas: una candidata a fatigue

HIGH-03 (dunning falla 3x por tenant) va a generar spam. Convertir a digest diario.

### Gaps de observabilidad

1. **Expiración de tokens** (CRÍTICO). No hay alerta preventiva de Meta WA ni MP keys.
2. **Health del worker de pg-boss.** No detecta worker colgado (solo mira queue size).
3. **Reconciliación MP.** No hay alerta si payment approved pero subscription no activada.
4. **Data retention job.** Si falla silenciosamente → compliance risk.
5. **Webhook signature failures.** Contador + alerta.
6. **Quota de Meta WA.** 250 msg/hora tier básico sin trackeo.

---

## 3. PRIVACY (doc18)

### Ley 25.326: cubierto bien

Mejor que 90% de los SaaS argentinos de su tamaño. Tenant isolation es suficiente para compliance.

### Gaps

1. Consentimiento para WhatsApp: ✅ cubierto.
2. **Menores de edad** (CRÍTICO). Un chico de 13 años puede registrarse. **Solución:** restringir a +18 con declaración jurada.
3. **DPO** no designado formalmente.
4. **Listado de sub-encargados** no se expone públicamente.
5. **consent_records** retiene IP indefinidamente (tensión con retención de 30 días).
6. **Audit logs y derecho de supresión** — PII en metadata de logs.
7. **Notificación a AAIP** — no cita Res. 47/2018.

---

## 4. RUNBOOK (doc19)

### Cubre los 9 escenarios más probables. Operable por 1 persona con asterisco.

- Grupo WA con 1 persona = decorativo. Necesita contacto de respaldo.
- Sin procedimiento de vacaciones/licencia.
- Tiempo de respuesta SEV-1 < 15 min es aspiracional para 1 persona.

### Procedimientos que faltan

1. **Key rotation** para MP, Supabase, Sentry (solo Meta cubierto).
2. **Cuenta comprometida** (service_role filtrada).
3. **Tenant export manual** (derecho ARCO B2B).
4. **Procedimiento de churn técnico** (eliminación de datos 90 días post-churn).
5. **Requerimientos legales** (oficio judicial, AFIP).
6. **Costo runaway** (ataque volumétrico).
7. **Deploy freeze windows.**
8. **Playbook de escala** (10 a 80 tenants).

---

## 5. DESIGN SYSTEM (doc20)

### UI/UX Pro Max como generador: viable, con reservas

1. **Dependencia externa** — ¿determinístico? ¿mantenido?
2. **Brecha MASTER.md ↔ código.** La fuente de verdad debe ser código:
   - Generar MASTER.md una vez
   - Traducir inmediatamente a tailwind.config.ts + CSS custom properties
   - MASTER.md pasa a ser documentación, no input de runtime
3. **Overrides por página** = puerta a fragmentación. Prohibir por default.

**Plan accionable:** Sprint 0: generar MASTER.md + traducir a tailwind.config.ts. Agregar ESLint rule contra colores hardcodeados.

---

## 6. REALISMO PARA EQUIPO PEQUEÑO

### Esencial para v1
- Testing: isolation tests, concurrency, webhook idempotency, 3 E2E happy paths (~80-100 tests)
- Observabilidad: Sentry + structured logs + UptimeRobot + 5 alertas CRIT
- Privacy: Política de Privacidad + TyC, consent checkboxes, RLS, restricción a +18, email privacidad@
- Runbook: secciones 1, 2, 3.1-3.5, 3.9 (data leak)
- Design system: MASTER.md + tailwind config el día 1

### Deferible a v1.5 o v2
- Tests de carga, tests MP sandbox semanales, business metrics cron, custom dashboards
- Self-service data export, DPA formal, runbook de key rotation, post-mortem templates
- Per-page design overrides

---

## Tabla de issues — Sesión 4

| ID | Doc(s) | Descripción | Severidad | Acción recomendada |
|---|---|---|---|---|
| T-01 | 16 | Doc lista 7 E2E tests pero expectativa es cubrir 12 flujos | Medio | Alinear expectativas o agregar 5 E2E faltantes |
| T-02 | 16 | Falta check automático de que toda tabla con tenant_id está en ISOLATED_TABLES | Alto | Test meta que lea information_schema y compare |
| T-03 | 16 | Falta tests de carga para concurrencia real (>2 requests) | Alto | Script k6/artillery antes del launch |
| T-04 | 16 | Tests de MP solo con mocks, no smoke test contra sandbox | Medio | Job semanal contra MP sandbox |
| T-05 | 16 | Tests de migrations faltantes | Alto | Test sobre DB seedeada con 100k filas |
| T-06 | 16 | Isolation tests no ejercitan JWT→middleware→RLS | Medio | Agregar 2-3 tests con HTTP request autenticado |
| T-07 | 16 | No hay security smoke tests | Medio | ~5-8 tests OWASP básicos |
| O-01 | 17 | Métricas de negocio sin alertas de salud | Alto | 3-4 alertas: bookings=0 en prime-time, past_due growth, conflict rate |
| O-02 | 17 | No hay alerta de expiración de token Meta WA | Crítico | Alerta a T-14 y T-7 días |
| O-03 | 17 | HIGH-03 dunning va a generar alert fatigue | Medio | Digest diario o subir umbral |
| O-04 | 17 | Health check no detecta worker de pg-boss colgado | Alto | Check: último completed en <15 min |
| O-05 | 17 | No hay reconciliación MP | Alto | Job diario de conciliación con alerta |
| O-06 | 17 | Data-retention-cleanup puede fallar silenciosamente | Alto | Alerta obligatoria si cron no completa |
| O-07 | 17 | No hay trackeo de quota de Meta WA | Medio | Contador wa_sent_last_hour, alerta al 80% |
| O-08 | 17 | No hay contador de webhook signature failures | Medio | Contador + alerta si >N/hora |
| P-01 | 18 | No hay restricción para menores de edad | Crítico | Restringir a +18 con declaración jurada |
| P-02 | 18 | No se designa responsable de protección de datos | Bajo | Designar persona formalmente |
| P-03 | 18 | Listado de sub-encargados no se expone públicamente | Medio | Incluir en Política de Privacidad |
| P-04 | 18 | Derecho de supresión no contempla audit_logs con PII | Medio | Documentar decisión: barrer o justificar interés legítimo |
| P-05 | 18 | consent_records retiene IP indefinidamente | Bajo | Documentar finalidad distinta |
| P-06 | 18 | Protocolo AAIP no cita Res. 47/2018 | Bajo | Agregar referencia |
| R-01 | 19 | "Grupo WA Emergencias" con 1 persona = decorativo | Alto | Email secundario + contacto de respaldo |
| R-02 | 19 | Sin procedimiento para vacaciones/licencias | Alto | Mini-runbook para no técnicos |
| R-03 | 19 | No hay key rotation para MP, Supabase, Sentry | Medio | Agregar runbook por credencial |
| R-04 | 19 | Sin procedimiento para cuenta comprometida | Alto | Playbook: rotar → forensics → revocar → notificar |
| R-05 | 19 | Sin export de datos por tenant (ARCO B2B) | Medio | Script de export filtrado por tenant_id |
| R-06 | 19 | Sin procedimiento de requerimiento legal | Medio | Documentar: a quién, qué, en qué formato |
| R-07 | 19 | Sin procedimiento ante runaway de costos | Medio | Alerta de billing + playbook |
| R-08 | 19 | Deploy freeze windows no definidas | Bajo | Documentar ventanas |
| R-09 | 19 | SEV-1 < 15 min es aspiracional para solo-dev | Bajo | Documentar realista: <15 min in-hours, <60 min off-hours |
| D-01 | 20 | MASTER.md es markdown, no código — riesgo de deriva | Alto | Traducir a tailwind.config.ts el día 1 |
| D-02 | 20 | Overrides por página = fragmentación | Medio | Prohibir por default |
| D-03 | 20 | No se valida determinismo del skill UI/UX Pro Max | Medio | Ejecutar 3 veces mismo prompt; fijar output |
| D-04 | 20 | No hay lint rule contra colores hardcodeados | Medio | ESLint plugin desde sprint 0 |
| G-01 | 16-20 | Los 5 docs juntos son demasiado para v1 con 1-3 personas | Alto | Cortar según §6: solo lo "esencial" va a v1 |
