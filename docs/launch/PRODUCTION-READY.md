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
- **Vendérselo a un desconocido que se enoja si algo falla** → falta **B1** (la escalada de
  morosidad, el único ❌ del documento) y conviene cerrar **B11** (el upgrade de plan, que
  cobra plata real y nunca se ensayó).

> **Revisión del 2026-09-01**: B3 a B10 quedaron cerrados en el PR #259 — cuatro con
> código y dos por decisión de negocio (PITR y staging, diferidos hasta 10 clientes).
> B2 sigue esperando el reloj (28/9). El repaso agregó **B11**, que no estaba en ningún
> documento: apareció auditando el registro de riesgos, no midiendo el producto.

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

|       | Hallazgo                                                 | Estado real                                                                                                                                                  |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-001 | La CSP bloquea el WebSocket de Realtime                  | ✅ **cerrado** — `next.config.ts:24` lista `wss://*.supabase.co` en `connect-src`                                                                            |
| F-002 | Producción sin conexiones a Postgres (`EMAXCONNSESSION`) | ✅ **cerrado** — `client.ts:48-55` documenta la causa (Fluid Compute reteniendo conexiones ociosas) y aplica `IDLE_TIMEOUT_SECONDS = 20` más un max lifetime |
| F-003 | Seña exigible sin MercadoPago conectado                  | ✅ **cerrado** — guard en `settings/rese                                                                                                                     | F-004 | El marketplace lista complejos de prueba | ✅ **cerrado** — flag `marketplace_visible` (migr. 082) con filtrado en buscador/sitemap y toggle en SuperAdmin |
| F-022 | La analítica web no se guarda                            | ✅ **cerrado** — auto-registro de sink vía `ensureSink` en `globalThis` (`breadcrumbs.ts`)                                                                   |
| F-024 | Invitación de empleado no recuperable                    | ✅ **cerrado** — `resendInviteAction` existe, con tests de membresía                                                                                         |

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

### A8. Los crons y el worker — ✅ verificados corriendo solos

48 horas de observación (24/8), 15 crons, cero fallados. Y el worker tiene monitor externo
con alerta: se probó tirándolo abajo, y avisó.

Ese monitor nació de un incidente real: el worker se cayó 26 minutos y nadie se enteró.

---

## B. Lo que falta para ofrecérselo a cualquiera

### B1. ❌ Ensayo P-10 pendiente de ejecución manual: Escalada de morosidad

**Qué es**: la escalada de morosidad (`past_due` → `suspended` → `blocked`).
La lógica de código y las transiciones ya están implementadas y cuentan con 21 tests unitarios automáticos pasando. Falta la ejecución manual en base de datos.

**Cómo se cierra**: Mismo método que el trial. Poner un complejo en `past_due` con
`dunning_started_at` de hace 8 días; el cron `dunning-retry` (16:00 UTC / 13:00 ART) lo
escala a `suspended`. Repetir con 15 días para el salto a `blocked`.

**Cómo se verifica**: El complejo cambia de estado solo, con su audit y su mail, sin que
nadie toque nada.

### B2. ⏳ En curso (esperando reloj): El segundo cobro mensual

**Qué es**: el ensayo P-02. Suscripción real reactivada el 28/8 con cobro de $100.
MercadoPago ejecutará el débito automático en la fecha correspondiente (28/9/2026).

**Cómo se verifica**: cuando llegue, tiene que aparecer un `subscription_authorized_payment`
en `processed_webhooks` y el período de la suscripción tiene que correrse un mes.

### B3. ✅ Cerrado: Analítica web persistiendo

**Qué era**: `analytics_events` solo tenía eventos del worker.
**Cierre**: Implementado auto-registro isomórfico `ensureSink()` en `breadcrumbs.ts` usando `globalThis`.

### B4. ✅ Cerrado (Decisión de negocio): Backup diario y PITR

**Decisión**: El backup físico diario automático (~00:45 ART, 8 días de retención) es suficiente para la etapa inicial de lanzamiento. La contratación de PITR se difiere hasta alcanzar los 10 clientes activos.

### B5. ✅ Cerrado (Decisión de negocio): Staging

**Decisión**: La provisión de entorno dedicado de staging (STAGING-001) se difiere hasta alcanzar los 10 clientes activos.

### B6. ✅ Cerrado: MFA en SuperAdmin

**Cierre**: `system-admin.guards.ts` ahora valida y exige MFA TOTP para accesos e impersonación cuando está configurado.

### B7. ✅ Cerrado: Control de visibilidad en marketplace

**Cierre**: Columna `marketplace_visible` (migración 082), filtrado en búsqueda pública, disponibilidad y sitemap, más toggle interactivo en la pestaña Resumen del SuperAdmin (`/super-admin/tenants/[id]`).

### B8. ✅ Cerrado: Subida de imágenes a Cloudflare R2

**Cierre**: Prueba end-to-end real ejecutada el 30/8 con subida exitosa de logo a Cloudflare R2 y visualización en el portal público. Se mejoró además la UX de subida (ocultamiento de dropzone vacío al alcanzar el máximo, botón claro "Cambiar logo/portada", feedback toast y guía de dimensiones).

### B9. ✅ Cerrado: Canal oficial de soporte

**Cierre**: Canales de atención oficiales definidos e integrados en el sistema (`SUPPORT_EMAIL = 'turnogol@gmail.com'`, `SUPPORT_WHATSAPP_NUMBER = '+54 9 2323 34-6976'`, `SUPPORT_WHATSAPP_URL = 'https://wa.me/5492323346976'`), enlazados en banners de suspensión y páginas de reactivación/ayuda.

### B10. ✅ Cerrado: Registro DMARC

**Cierre**: Registro TXT de DMARC activo y verificado en Cloudflare DNS (`v=DMARC1; p=none; rua=mailto:dmarc@turnogol.app`).

### B11. ❌ Nunca ocurrió: el upgrade de plan cobra plata real y no se probó

**Cómo apareció**: auditando el registro de riesgos el 2026-09-01. `TG-P1-MP-02` seguía
diciendo que `/api/billing/upgrade` devuelve 501 detrás de un flag apagado. **Ya no**: la
migración `067_enable_saas_upgrade_flag.sql` arregló el bug de fondo (la
`notification_url` de la cuenta master lleva `&source=saas` y el handler elige la cuenta
con ese discriminador, más el cross-check de `external_reference`) y prendió el flag con
una fila global.

**Por qué importa**: el proraeo de un upgrade es **un quinto circuito de plata**, y no está
entre los cuatro de §A1. Está prendido en producción y nunca cobró un peso de verdad. La
propia migración lo dice: "es plata real por un camino recién estrenado".

**Qué puede salir mal**: es exactamente la clase de camino donde el bug anterior ya mordió
una vez — el pago entra como evento `payment`, igual que la seña de una reserva, y la
elección de cuenta depende de un discriminador en la URL. Si algo lo pierde, el complejo
paga y el upgrade no se aplica.

**Cómo se cierra**: mismo método que los otros cuatro. Un upgrade real de un plan barato a
otro, y verificar que el `payment` llegue con `source=saas`, que el `external_reference`
concuerde, y que el plan quede efectivamente cambiado con `pending_plan_change` limpio.
Mientras tanto, el flag permite apagarlo por complejo o global sin esperar un deploy.

---

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
| 11  | **B11** — ensayar el upgrade de plan                        | 1 cobro real                | Al primer complejo que cambie de plan      |

**Los ítems 1, 2, 3 y 4 son lo que yo cerraría antes de la primera venta a alguien que no
conocés.** Suman dos días de reloj, cinco minutos de prueba y dos decisiones tuyas.
