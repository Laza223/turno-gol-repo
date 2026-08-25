# Handoff: qué falta para que TurnoGol sea vendible — 2026-08-25

> **Para qué sirve este documento.** Arrancar una sesión nueva sin releer nada. Acá está el estado real de cada ensayo, medido contra la base de producción hoy, y la lista de lo que falta con su costo. Nada de esto sale de memoria ni de un resumen: todo se midió con consultas a producción.
>
> **La regla que hay que respetar y que ya falló una vez.** Medir el estado presente **no** dice qué pasó. El 24/8 vi "cero suscripciones activas" y concluí que P-01 nunca se había hecho; se había hecho el 20/8 y se canceló 8 minutos después. Para saber qué pasó se consultan `audit_logs` y `notifications`, que son append-only.

---

## 1. Lo que cambió y obliga a re-testear: ahora hay DOS aplicaciones de MercadoPago

Hasta el 2026-08-22 había una sola aplicación. Hoy hay dos, y **todo lo que se probó antes de esa fecha se probó con una sola**:

| | Qué cobra | Credencial | Clave de webhook |
|---|---|---|---|
| **App A · Suscripciones** | El plan mensual de TurnoGol, a tu cuenta | `MP_TURNOGOL_ACCESS_TOKEN` | `MP_WEBHOOK_SECRET` |
| **App B · Checkout Pro** | La seña del jugador, a la cuenta del complejo | `MP_CLIENT_ID` + `MP_CLIENT_SECRET` (OAuth) | `MP_WEBHOOK_SECRET_CHECKOUT` |

**Las dos notifican al mismo buzón** (`/api/webhooks/mercadopago`) y `webhook-auth.ts` acepta cualquiera de las dos firmas. Consecuencia directa: **que los webhooks de una app funcionen no dice nada de la otra**, y desde adentro de TurnoGol un rechazo se ve igual que un silencio.

Inventario completo, verificación y rotación: [`docs/operations/credenciales-mercadopago.md`](../operations/credenciales-mercadopago.md).

---

## 2. Estado real del plan de producción

Fuente: [`PLAN_PRODUCCION_2026-08-17.md`](PLAN_PRODUCCION_2026-08-17.md) · evidencia: [`EVIDENCIA_PROD_2026-08-25.md`](EVIDENCIA_PROD_2026-08-25.md)

| | Ensayo | Estado | Hay que re-testear con las 2 apps |
|---|---|---|---|
| **P-01** | Suscripción propia, plata real | ✅ 20/8, plan interno de $100 | **Sí** — usa App A; verificar que el token master siga siendo el de la cuenta correcta |
| **P-02** | Débito automático del mes 2 | ❌ **nunca arrancó** | — |
| **P-03** | Seña real punta a punta | ✅ 6 señas con `mp_payment_id` real | **Sí** — las 6 son de App A o de la ventana de migración |
| **P-04** | Mismo webhook dos veces | ❌ sin evidencia | **Sí**, y ahora son dos pruebas: una por app |
| **P-05** | Pago sobre el filo del hold | 🟡 el caso exacto no; los dos peores sí | No cambia con las apps |
| **P-06** | Devolución de la seña | 🟡 camino principal sí, 3 sub-casos no | **Sí** — el cobro va por App B |
| **P-07** | Día operativo cerrado | ✅ 24/8, `diff_amount = 0` | No |
| **P-08** | Los 15 crons corriendo solos | ✅ 24/8, 48 h, 0 fallados | No |
| **P-09** | Trial que vence solo | ❌ de reloj, sin arrancar | No |
| **P-10** | Dunning completo con rechazo real | ❌ de reloj, sin arrancar | Sí — App A |
| **P-11** | Restore de backup | ✅ 24/8, RTO < 5 min, RPO 24 h | No |
| **P-12** | Worker caído | ✅ 24/8, monitor externo probado | No |
| **P-13** | Baja de suscripción | ✅ 20/8 | Sí — App A |

**Los tres relojes**: P-02 (30 días), P-09 y P-10 (14 días). Ninguno arrancó. Son lo único cuyo costo crece un día por cada día que pasa.

---

## 3. Los 6 🔴 de PROD_QA — medidos hoy

| | Hallazgo | Estado hoy |
|---|---|---|
| F-001 | CSP bloquea el WebSocket de Realtime | Sin re-verificar en esta sesión |
| F-002 | Producción sin conexiones a Postgres | Sin re-verificar |
| F-003 | Seña exigible sin MercadoPago conectado | Sin re-verificar |
| F-004 | Marketplace lista complejos de prueba | 🟡 **los 4 complejos basura ya no existen**; quedan 2, los dos tuyos. La causa raíz —no hay flag de visibilidad— sigue abierta |
| **F-022** | La analítica web no se guarda | 🔴 **NO está cerrado — medido hoy** (ver abajo) |
| F-024 | Empleado invitado sin recuperar invitación | Sin re-verificar |

### 🔴 F-022 sigue roto, y ahora hay fecha

`analytics_events` tiene 98 filas y **se cortó el 2026-08-23 a las 05:00 UTC**:

| Día | Eventos |
|---|---|
| 18/8 | 2 |
| 19/8 | 45 |
| 20/8 | 27 |
| 21/8 | 10 |
| 22/8 | 6 |
| 23/8 | 8 |
| **24/8** | **0** |
| **25/8** | **0** |

No es falta de tráfico: el **24/8** se ejecutó P-07 entero desde el navegador (abrir caja, cantina, fiado, gasto, cierre) y el **25/8** se reconectó MercadoPago desde el admin. Cero eventos los dos días. Es una regresión con ventana acotada — algo entre el 22 y el 23 de agosto.

**Primera pista a mirar**: el sink se registra desde `instrumentation.ts` y `run-workers.ts`, no desde el grafo de la app. Ya hubo un caso idéntico con el locale de Zod — lo que se registra en `instrumentation.ts` se bundlea en otro layer y la app no lo ve. El commit sospechoso por fecha es `14bca7b7` (22/8, "los logger.error de los workers ahora llegan a Sentry"), que tocó observabilidad.

---

## 4. Lo que hay que probar, ordenado

### 4.1 Primero: las credenciales, sin gastar un peso

Cuatro chequeos. Todos piden credenciales productivas, así que los corre Lazar.

```bash
LAUNCH_CHECK_ENV_FILE=.env.production pnpm launch:check --probe-only
```

Dos sondas relevantes: `mp credentials probe (Checkout Pro)` espera un **400**, y `mp master token probe (Suscripciones)` —agregada hoy— espera **200** e imprime el **id de cuenta**, que es el chequeo que de verdad importa.

```bash
$env:MP_WEBHOOK_SECRET="<clave de App A>"; pnpm tsx scripts/probe-mp-webhook-signature.ts 9fcb4ecc-c1f8-43e2-9a53-5f1e599eb1e6
```

```bash
$env:MP_WEBHOOK_SECRET="<clave de App B>"; pnpm tsx scripts/probe-mp-webhook-signature.ts 9fcb4ecc-c1f8-43e2-9a53-5f1e599eb1e6
```

Las **dos** tienen que dar 200. Y el cuarto chequeo es del lado de MercadoPago: panel → Tus integraciones → **cada app** → Webhooks → historial. Todo en 200.

### 4.2 Después: la plata, $100 por circuito

| Ensayo | Qué prueba | Costo |
|---|---|---|
| Seña en un complejo **reconectado a App B** | Que el cobro y el aviso de la app nueva funcionen | $100 |
| Suscripción con el plan interno, **dejándola viva** | Arranca P-02, P-09 y P-10 | $100/mes |
| Cancelar fuera de política | `canceled_no_refund` + `captured` — nunca se ejercitó | $0 |
| Botón "Ya devolví" en efectivo | Que salga el egreso en caja | $0 (usa una devolución pendiente de titi) |
| Devolver desde el panel de MP | Que el webhook salde la fila solo | $0 (usa la otra) |
| Reenviar el mismo webhook desde el panel | P-04, idempotencia, **una vez por app** | $0 |
| QR + push al admin | Lo visual de P-03 | $0 |

**Precondición de P-01/P-02**: `complejo-elite-futbol` tiene `mp_payer_email` en `NULL`, así que el preapproval saldría a nombre de la cuenta master pidiéndole pagarse a sí misma y MercadoPago lo rechaza. Se arregla en `/settings/facturacion` → "Cuenta de MercadoPago para pagar". Y el plan interno de $100 está en `is_active = false`: hay que prenderlo para poder elegirlo.

---

## 5. Hallazgos abiertos de esta sesión

| | Qué | Cómo se cierra |
|---|---|---|
| 🔴 | **F-022**: la analítica web se cortó el 23/8 | Diagnóstico: ver §3 |
| 🔴 | **La razón por la que borramos el reembolso automático no era la que escribimos.** Hay una devolución con id real de MercadoPago (`3199064441`), sin rastro de script manual y con el webhook descartado por horario. Lo más probable: el 403 era de **una** conexión y se generalizó. La decisión de producto no cambia; el motivo escrito ya se corrigió | `GET /v1/payments/174271786893/refunds` con el token del complejo |
| 🟡 | **2 de 6 señas no llegaron por webhook**, las dos del mismo complejo, y la segunda cae en la ventana de la migración | Historial de notificaciones de App B alrededor del 23/8 00:50 |
| 🟡 | Resend timeouts intermitentes (4 `health.ping.degraded` en 24 h) | Sin diagnosticar |

---

## 6. Deuda que no es de este esfuerzo

- **60 hallazgos** de QA exploratorio en [`AUDIT_APP_FINDINGS.md`](AUDIT_APP_FINDINGS.md) — 8 🔴 + 34 🟡 + 18 🟢, sesión cerrada el 13-14/8, sin triage.
- **F-001, F-002, F-003, F-024** de PROD_QA: sin re-verificar desde el 17/8.
- `complejo-titi` debe 2 devoluciones de $100 desde el 22/8. Tarea del complejo, no falla del sistema — pero sirven como material de prueba.

---

## 7. Cómo arrancar la sesión nueva

1. **Verificá en qué rama estás.** El árbol de trabajo apareció hoy en un `main` atrasado dos commits, movido por otra sesión. `git fetch && git status`.
2. ⚠️ **Corrección (2026-08-25, tarde).** Esta línea decía que los PR #213 y #214
   estaban mergeados y que no había trabajo sin commitear. **El #214 se mergeó
   contra `docs/p01-precondicion-payer-email`, que no es `main`** y que ya había
   sido absorbida por el #213 — así que su contenido nunca llegó a `main`: la
   corrección del motivo del 403 en `CLAUDE.md`, `EVIDENCIA_PROD_2026-08-25.md` y
   la actualización de `PLAN_PRODUCCION_2026-08-17.md`. Lo mismo pasó con el
   commit `8483f672` (sonda del token master + runbook de credenciales), que
   quedó pusheado sin PR. Todo eso se recuperó después.
   **La lección, que ya mordió tres veces: "el PR está mergeado" no implica "está
   en `main`" — hay que mirar contra qué rama base se mergeó.**
3. Empezá por §4.1 — las credenciales, que no cuestan nada y condicionan todo lo demás.
4. Lo que decida el calendario es abrir la suscripción de $100 **y dejarla viva**: sin eso, P-02, P-09 y P-10 no existen.
