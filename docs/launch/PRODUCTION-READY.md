# Production-Ready — qué falta para ofrecerle TurnoGol a cualquiera

**Medido el 2026-08-30.** Este documento no repite lo que dicen otros documentos: mide
contra el código y contra la base de producción, porque ya pasó dos veces que un
documento diera por abierto algo que estaba cerrado (y una vez al revés).

Documentos relacionados, que este NO reemplaza: [`RISK_REGISTER.md`](RISK_REGISTER.md)
(riesgos con dueño y evidencia), [`LAUNCH_BACKLOG.md`](LAUNCH_BACKLOG.md) (tickets),
[`../tech-debt.md`](../tech-debt.md) (deuda con disparador),
[`../qa/GUION-ENSAYOS-PLATA-2026-08-28.md`](../qa/GUION-ENSAYOS-PLATA-2026-08-28.md)
(los ensayos de plata con su evidencia).

---

## Cómo leer este documento

Cada ítem tiene uno de tres estados, y la diferencia importa:

| Estado                               | Qué significa                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| ✅ **Verificado**                    | Se ejecutó y hay evidencia pegada: una query, un output, una fila en la base. Se dice cuándo y con qué. |
| 🟡 **Escrito pero no re-verificado** | Alguien lo dio por hecho en algún momento. Puede seguir siendo cierto. No se volvió a medir.            |
| ❌ **Nunca ocurrió**                 | El camino existe en el código pero jamás corrió contra la realidad.                                     |

**Regla que rige este documento**: "hay un test que lo cubre" no es ✅. "El commit dice
que se arregló" tampoco. ✅ es evidencia de que el comportamiento ocurrió.

---

## Veredicto

**TurnoGol puede cobrar hoy.** Los cuatro circuitos de dinero funcionaron con plata real
entre el 28 y el 30 de agosto de 2026, y quedaron con evidencia.

**Lo que todavía no sabés es qué pasa cuando algo sale mal.** El camino feliz está
probado; el camino del cliente que no paga, no. Y no tenés ni un dato de comportamiento
de usuario para entender por qué alguien abandona.

La diferencia práctica:

- **Vendérselo a un complejo conocido, con vos mirando** → listo.
- **Vendérselo a un desconocido que se enoja si algo falla** → faltan los puntos B1 a B4.

---

## A. Lo que ya está cubierto

### A1. Los cuatro circuitos de plata — ✅ verificado con plata real

Todo esto ocurrió entre el 28 y el 30/8/2026 sobre producción. Evidencia completa en el
guión de ensayos; acá el resumen de qué prueba cada uno.

| Circuito                           | Qué se probó                                        | Evidencia decisiva                                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Suscripción SaaS**               | Reactivación con cobro real de $100                 | `tenant.reactivated` comparte microsegundo con el webhook del pago (`22:36:47.765071`). Eso descarta que lo haya movido el botón de soporte: `transitionToActiveFromAny` tiene dos llamadores y solo uno corre dentro del webhook |
| **Seña por Checkout Pro**          | Primer cobro de la historia por la app del complejo | El evento llega con `user_id` 1059888348 —la cuenta del complejo, no la master 381048203— y `booking.transition.confirmed` sale DENTRO del procesamiento del webhook, sin ningún `payment.reconcile.confirmed`                    |
| **Cancelación fuera de política**  | El complejo retiene la seña                         | `canceled_no_refund`, la seña sigue `approved`, cero filas de `refund`, e ingreso firme en `cash_flows`                                                                                                                           |
| **Cancelación dentro de política** | Se genera la devolución                             | `canceled_refunded` + fila `refund` en `pending` en el mismo instante del cancel                                                                                                                                                  |

**Sin preapproval huérfano**: al reactivar, el preapproval viejo se cancela antes de crear
el nuevo. Verificado contra MercadoPago real, no contra el comentario del código. Ese es
el riesgo de doble cobro que más caro sale si falla.

### A2. Idempotencia de webhooks — ✅ verificado con tráfico real

No hizo falta un replay sintético: MercadoPago mandó avisos repetidos por su cuenta.

| Recurso             | Avisos entregados |
| ------------------- | ----------------- |
| preapproval nuevo   | 3                 |
| preapproval viejo   | 3                 |
| pago de suscripción | 2                 |

Ocho avisos, tres recursos repetidos, y **`tenant.reactivated` figura una sola vez**. Un
solo cambio de estado, un solo período extendido, cero efectos duplicados.

Nota para quien retome esto: **el panel de MercadoPago no ofrece reenviar un aviso a
mano**, y el harness del repo (`scripts/replay-mp-webhook.ts`) rechaza producción por
diseño (`assertNotProduction()` más guardas por `VERCEL_ENV` y hostname, y firma con una
clave hard-gateada a `NODE_ENV !== 'production'`). No perder tiempo buscando ese botón.

### A3. Vencimiento del trial — ✅ verificado de punta a punta

Ensayo del 29-30/8: se adelantó el reloj del trial de un complejo y el sistema hizo lo
suyo solo, sin que nadie tocara nada.

- **29/8 11:00 UTC** — mail "tu prueba vence en 1 día", con el número correcto calculado
  del tiempo real restante, y `trial_warning_days_sent = 1` escrito (la marca que impide
  que se repita).
- **30/8 11:00:20 UTC** — el complejo y su suscripción pasan a `blocked`, con audit
  `trial_ends_at_passed`.

### A4. Los seis 🔴 de PROD_QA — cinco cerrados, medidos uno por uno

Los documentos previos los daban como "sin re-verificar". Se midieron contra el código el
30/8:

|       | Hallazgo                                                 | Estado real                                                                                                                                                      |
| ----- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-001 | La CSP bloquea el WebSocket de Realtime                  | ✅ **cerrado** — `next.config.ts:24` lista `wss://*.supabase.co` en `connect-src`                                                                                |
| F-002 | Producción sin conexiones a Postgres (`EMAXCONNSESSION`) | ✅ **cerrado** — `client.ts:48-55` documenta la causa (Fluid Compute reteniendo conexiones ociosas) y aplica `IDLE_TIMEOUT_SECONDS = 20` más un max lifetime     |
| F-003 | Seña exigible sin MercadoPago conectado                  | ✅ **cerrado** — guard en `settings/reservas/actions.ts:74` (`if (requiresDeposit && !tenant.mpConnectedAt)`) y el form lo respeta (`ReservasPolicyForm.tsx:67`) |
| F-004 | El marketplace lista complejos de prueba                 | 🟡 **sin basura, causa raíz abierta** — hoy hay 2 complejos y los dos son propios; sigue sin existir un flag de visibilidad                                      |
| F-022 | La analítica web no se guarda                            | ❌ **abierto** — ver B3                                                                                                                                          |
| F-024 | Invitación de empleado no recuperable                    | ✅ **cerrado** — `resendInviteAction` existe, con tests de membresía                                                                                             |

### A5. Aislamiento entre complejos — ✅ verificado por gate bloqueante

El aislamiento multi-tenant tiene una suite propia que corre en CI como **required check**
(`Integration & Isolation (BLOCKING)`). No es "hay tests": es que el merge no entra si se
rompe.

Lo que cubre: fail-safe cross-tenant sobre las tablas aisladas, y aserción de schema que
falla ante una tabla nueva con RLS pero sin `FORCE`. El rol de la app (`turnogol_app`) no
tiene `BYPASSRLS` — verificado por `launch-check.ts`.

### A6. No hay doble reserva — ✅ invariante garantizada

A lo sumo una reserva viva puede ocupar el mismo horario en la misma cancha. Enforced por
tres capas: constraint `EXCLUDE USING gist` en la base, `FOR UPDATE` sobre la cancha, y
un UPDATE condicional race-safe. Con tests de carrera y un script de estrés de 50
requests paralelas.

Esto no es "confiamos en el código": si las tres capas fallaran a la vez, la base
rechazaría la fila igual.

### A7. Backups — ✅ restore real ejecutado

Simulacro del 24/8 con "Restore to new project" sobre un backup real. **RTO de la base:
menos de 5 minutos.** Conteos, 101 policies RLS, roles, extensiones y usuarios idénticos
a la predicción.

⚠️ **Pero el RPO real es de hasta 24 horas** — ver B4.

### A8. Los crons y el worker — ✅ verificados corriendo solos

48 horas de observación (24/8), 15 crons, cero fallados. Y el worker tiene monitor externo
con alerta: se probó tirándolo abajo, y avisó.

Ese monitor nació de un incidente real: el worker se cayó 26 minutos y nadie se enteró.

---

## B. Lo que falta para ofrecérselo a cualquiera

Ordenado por cuánto duele si sale mal, no por esfuerzo.

### B1. ❌ No sabés qué pasa con un cliente que no paga

**Qué es**: la escalada de morosidad (`past_due` → `suspended` → `blocked`) nunca corrió.
Es el ensayo P-10, el único de plata que queda sin hacer.

**Por qué importa para vender**: todo lo probado hasta hoy es el camino feliz o la baja
voluntaria. El día que a un cliente real le rebote la tarjeta, ese código corre por
primera vez sobre alguien que te debe plata y que además se va a enojar. Es exactamente el
peor momento para descubrir un bug.

**Cómo se cierra**: mismo método que el trial. Poner un complejo en `past_due` con
`dunning_started_at` de hace 8 días; el cron `dunning-retry` (16:00 UTC / 13:00 ART) lo
escala a `suspended`. Repetir con 15 días para el salto a `blocked`.

**Cómo se verifica**: el complejo cambia de estado solo, con su audit y su mail, sin que
nadie toque nada. Dos días de reloj, costo cero.

### B2. ❌ El segundo cobro mensual nunca ocurrió

**Qué es**: el ensayo P-02. Hay una suscripción viva que va a cobrar sola, pero ese
segundo débito automático todavía no pasó nunca en la historia del producto.

**Por qué importa**: es el evento que define si tenés un negocio recurrente o una venta
única. Si el cobro del mes 2 falla en silencio, te enterás por un cliente enojado.

**Cómo se cierra**: esperando. El reloj ya está corriendo.

**Cómo se verifica**: cuando llegue, tiene que aparecer un `subscription_authorized_payment`
en `processed_webhooks` y el período de la suscripción tiene que correrse un mes.

### B3. ❌ Estás ciego: la analítica del lado web nunca escribió

**Qué es**: `analytics_events` tiene 114 filas en tres categorías —webhook, payment,
booking— **y las tres las escribe el worker**. Cero eventos de login, búsqueda,
onboarding o caja. No es que se cortó: el lado web nunca persistió.

**Por qué importa para vender**: el día que un complejo te diga "mis clientes no
reservan", no vas a tener con qué contestarle. No sabés cuántos abren el portal, cuántos
llegan al pago, ni dónde abandonan. Para cobrar no hace falta; para vender y para mejorar
el producto, sí.

**Pista para quien lo agarre**: el sink se registra desde `instrumentation.ts`, y eso se
bundlea en otro layer que el grafo de la app no ve. Ya pasó idéntico con el locale de Zod.
Si algo tiene que ser visible desde la app, va en `globalThis`, no en `instrumentation.ts`.

**Cómo se verifica**: navegar el portal como jugador y que aparezcan filas de categorías
distintas de las tres del worker.

### B4. 🟡 Si se cae la base, perdés hasta un día de operación

**Qué es**: el backup es físico diario (~00:45 ART, 8 días de retención). **PITR no está
contratado** — es un add-on, y el registro de riesgos afirmaba lo contrario hasta que se
midió.

**Por qué importa ahora**: la decisión de posponerlo fue explícita y razonable — "se
reabre cuando entre el primer cliente que cobre de verdad". **Ese momento ya llegó**: el
28/8 entró la primera seña real por Checkout Pro.

**Qué se pierde concretamente**: en el simulacro del 24/8, la base restaurada no tenía el
ensayo de esa misma mañana — dos reservas, cinco movimientos de caja, el catálogo de
cantina y el cierre del día. Eso, con un cliente real, es un día de caja que hay que
reconstruir a mano.

**Decisión pendiente del dueño**: contratar PITR o aceptar el RPO de 24 h por escrito
frente al primer cliente.

### B5. 🟡 Todo se prueba en producción

**Qué es**: STAGING-001, sin provisionar. No hay ambiente donde romper cosas.

**Por qué importa**: los ensayos de esta semana se hicieron sobre la base real porque no
hay otro lado. Funcionó porque los dos complejos son propios. Con un cliente adentro, cada
prueba pasa a ser un riesgo sobre datos ajenos.

**Costo conocido**: unos USD 10/mes.

### B6. 🟡 El superadmin entra con solo una contraseña

**Qué es**: las columnas de MFA existen en el schema pero **el guard no las exige**.
Verificado: `system-admin.guards.ts` no menciona MFA ni TOTP.

**Por qué importa**: ese usuario ve todos los complejos y puede impersonar a cualquiera.
Es la llave maestra del sistema, y hoy la protege una contraseña sola.

**Atenuante**: el guard sí hace triple verificación de identidad (claim del JWT + fila
activa en la tabla + allowlist por variable de entorno). No es débil en identidad; es
débil en segundo factor.

### B7. 🟡 El marketplace no tiene control de visibilidad

**Qué es**: cualquier complejo en `active` o `trialing` aparece listado e indexable. No
hay flag para excluir uno.

**Por qué importa**: hoy no hay basura —los dos complejos listados son propios— pero el
primer cliente que quiera estar en el sistema sin aparecer en el listado público no tiene
cómo.

### B8. 🟡 Nunca se subió una foto de cancha contra el bucket real

**Qué es**: la dependencia que rompía esto se arregló río arriba y los tests unitarios
pasan, pero **la prueba end-to-end real —subir una foto desde el admin al bucket de
producción— nunca se hizo**.

**Por qué importa**: es lo primero que hace un complejo al configurarse. Si falla, falla
en el minuto uno de la relación.

**Cómo se verifica**: subir una foto desde el panel y ver que se muestre en el portal
público. Cinco minutos.

### B9. 🟡 No hay canal de soporte definido

**Qué es**: no está escrito qué hace un complejo cuando algo falla un sábado a las 22 hs,
que es exactamente cuando se usa el producto.

**Por qué importa**: es la diferencia entre un cliente que espera y uno que se va. Existe
un protocolo de las primeras 48 horas post-lanzamiento y un manual del dueño, pero no un
canal ni un tiempo de respuesta comprometido.

**Esto no es código**: es una decisión de negocio. WhatsApp, mail, horario, qué se promete.

### B10. 🟡 DMARC pendiente

Programado para el 8/9/2026. Sin él, los mails del sistema tienen más chance de caer en
spam — y los mails del sistema son cómo el complejo se entera de que le vence el trial o
de que le entró una reserva.

---

## C. Lo que el producto NO hace, y hay que decirlo al vender

Esto no es deuda: son decisiones tomadas. Están acá para que nadie prometa de más en una
demo. El detalle y el porqué de cada una está en `CLAUDE.md`.

- **No hay reembolso automático.** La devolución la hace el complejo desde MercadoPago; el
  sistema la registra y la recuerda en `/caja/devoluciones`. Se intentó por API y
  MercadoPago lo rechaza siempre con la cuenta de un tercero — o sea, con cualquier
  cliente real.
- **No hay WhatsApp.** Descartado para la v1. Las notificaciones al jugador van por mail;
  al complejo, por push.
- **No hay recordatorio al jugador 24 hs antes.** Se reconstruye cuando entre WhatsApp.
- **No hay facturación AFIP.** Fuera de alcance de la v1.
- **No hay billetera del jugador.** Los reembolsos se resuelven entre jugador y complejo.
- **El jugador no ve la grilla en tiempo real.** El tiempo real es solo para el panel del
  complejo.
- **Torneos está detrás de un flag apagado.**
- **No se pueden escribir notas libres sobre personas.** Las etiquetas son un conjunto
  cerrado de cinco, por Ley 25.326.
- **Un turno dura 60 minutos, fijo.** No es configurable.

---

## D. Cómo verificar todo esto de nuevo

Los ✅ de este documento se pueden re-medir. Los comandos:

```bash
# Los cuatro del juez — es lo que corre el required check "Lint & Types"
pnpm format:check && pnpm lint && pnpm typecheck && pnpm knip

# Aislamiento entre complejos (required check, bloqueante)
pnpm test:integration

# Credenciales y estado de producción, sin pasos destructivos
pnpm launch:check -- --probe-only

# Errores de producción de las últimas 24 h
pnpm sentry:issues 24h
```

Y sobre la base de producción, para los ítems que se miden con datos:

```sql
-- B3: si aparecen categorías distintas de webhook/payment/booking, el lado web escribe
SELECT category, count(*), max(occurred_at)::date
FROM analytics_events GROUP BY category ORDER BY 2 DESC;

-- B7: quién aparece hoy en el marketplace público
SELECT name, status FROM tenants WHERE status IN ('active','trialing');

-- A2: idempotencia — cuántos avisos por recurso, y si duplicaron efectos
SELECT data->>'mpPaymentId' AS recurso, count(*) AS avisos
FROM analytics_events WHERE event = 'mp.webhook.processed'
GROUP BY 1 HAVING count(*) > 1;
```

---

## E. La lista corta

Si hay que elegir, este es el orden. Los dos primeros son los que separan "le vendo a un
conocido" de "le vendo a cualquiera".

| #   | Qué                                                         | Costo                       | Bloquea vender a un desconocido            |
| --- | ----------------------------------------------------------- | --------------------------- | ------------------------------------------ |
| 1   | **B1** — probar la escalada de morosidad                    | 2 días de reloj, $0         | **Sí**                                     |
| 2   | **B4** — decidir PITR, o aceptar el RPO de 24 h por escrito | USD ~25/mes, o una decisión | **Sí**                                     |
| 3   | **B8** — subir una foto de cancha de verdad                 | 5 minutos                   | Casi                                       |
| 4   | **B9** — definir el canal de soporte                        | Una decisión, no código     | **Sí**                                     |
| 5   | **B2** — esperar el segundo cobro mensual                   | Tiempo                      | No, pero enterarse tarde duele             |
| 6   | **B3** — que la analítica web escriba                       | ~medio día                  | No para cobrar; sí para mejorar            |
| 7   | **B6** — exigir segundo factor al superadmin                | ~1 día                      | No, pero es la llave maestra               |
| 8   | **B5** — ambiente de staging                                | USD 10/mes                  | No, pero cada prueba es sobre datos reales |
| 9   | **B7** — flag de visibilidad del marketplace                | ~2 h                        | Al primer cliente que lo pida              |
| 10  | **B10** — DMARC                                             | Ya agendado 8/9             | No                                         |

**Los ítems 1, 2, 3 y 4 son lo que yo cerraría antes de la primera venta a alguien que no
conocés.** Suman dos días de reloj, cinco minutos de prueba y dos decisiones tuyas.
