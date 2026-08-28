# DOC 4 — Monetización, Lifecycle SaaS & Billing
## TurnoGol: Modelo de Negocio + Ciclo de Vida Completo del Tenant

> **Propósito**: Documento autoritativo y ÚNICO para todo lo relacionado con pricing, lifecycle del tenant,
> trial, dunning, cancelación y billing. Cualquier contradicción con otros docs → este documento gana.

> [!IMPORTANT]
> **Este documento reemplaza y unifica** la monetización original (Doc 4 anterior) y el lifecycle SaaS
> (Doc 9 anterior). Ambos documentos contenían versiones incompatibles de la máquina de estados,
> timelines de dunning y nombres de planes. Esta versión es la fuente de verdad definitiva.

---

## 1. Modelo de Pricing

### Decisión: Suscripción mensual por cantidad de canchas

**Por qué este modelo y no otro:**
- Ya fue validado por ATC Sports con miles de clientes en Argentina → no hay que educar al mercado
- Es predecible para el dueño (sabe exactamente cuánto paga por mes)
- Es predecible para nosotros (MRR estable, no comisiones variables)
- Alternativa descartada: comisión por reserva → volatilidad de ingresos, incentivo desalineado

---

### Planes

| Plan | Canchas | Precio mensual | Precio anual (por mes) | Ahorro anual |
|---|---|---|---|---|
| **Predio** | 1 – 3 canchas | $63.000 ARS | $50.400 ARS (20% off) | $151.200 ARS |
| **Complejo** | 4 – 6 canchas | $99.000 ARS | $79.200 ARS (20% off) | $237.600 ARS |
| **Estadio** | 7+ canchas | $129.000 ARS | $103.200 ARS (20% off) | $309.600 ARS |

> [!NOTE]
> **Actualizado 2026-08-07 (migr. 071).** Antes: 1-2 / 3-5 / 6+ a $55.000 / $85.000 / $115.000.
> Cambiaron **los cortes, no solo los precios**: ATC corta en 1-3 / 4-6 / 7+ y nosotros cortábamos
> distinto, así que la comparación daba diferente según la cantidad de canchas y en DOS franjas
> (3 y 6) TurnoGol salía más caro — con 3 canchas siendo el piso del ICP. Con los cortes
> alineados la comparación es franja contra franja y TurnoGol queda ~11% abajo en las tres.
> Fundamento: `docs/planning/2026-08-07-analisis-rubro-y-decisiones.md` §4.
>
> ATC cobra $71.000 / $111.000 / $145.000 ARS/mes (navegado por el founder desde IP argentina,
> 2026-08-07; en julio eran $66.000 / $104.000 / $136.000).
> Revisar precios cada 3 meses dado el IPC argentino (ver sección 5: ARS volátil).

> [!WARNING]
> **El IVA está sin resolver y afecta la comparación con ATC.** Este documento decía
> *"Precios NO incluyen IVA — se agrega 21% en el checkout"*, pero **el código no agrega IVA en
> ningún lado** (barrido completo de `src/`, 2026-08-07: cero implementación). Hoy el checkout
> cobra el precio pelado de la tabla.
>
> Importa porque cambia el signo de la comparación: si $63.000 es final, ganamos 11% contra los
> $71.000 de ATC; si hay que sumarle 21% ($76.230), **perdemos**. Y el sitio de ATC no aclara si
> sus precios llevan IVA (verificado en julio y de nuevo en agosto).
>
> Es una decisión de negocio + fiscal, no técnica: queda como **REQUIERE INPUT** hasta que el
> dueño defina si el precio publicado es final o si el IVA se discrimina. Las menciones de IVA
> que quedan en §10 y §11 de este documento describen ese estado no implementado.

**Trial**: 30 días gratis, sin tarjeta requerida al inicio.
**Sin costos de instalación, capacitación ni mantenimiento** (igual que ATC, ya es expectativa del mercado).

---

### Diferenciadores incluidos en todos los planes
- Dashboard analytics visual
- Onboarding self-service con UX guiada paso a paso
- Reservas online con pago de seña vía MercadoPago
- Gestión de turnos fijos (abonados) desde la grilla del admin
- Reportes completos (mismo nivel para todos los planes)
- Sin límite de staff: se permiten **múltiples cuentas admin** por complejo con privilegios completos (sin límite duro; única regla: debe quedar ≥1 admin activo), más managers permisivos sin necesidad de PIN (Decisión de auditoría 2026-07-21: corregido de "una sola cuenta admin por complejo" a multi-admin, alineado con US-ADM-003 y el código)

---

## 2. Lifecycle Completo del Tenant — Máquina de Estados Autoritativa

> [!IMPORTANT]
> Esta es LA máquina de estados del tenant. Tiene **8 estados**.
> Cualquier otro doc que muestre menos estados o transiciones diferentes está desactualizado.

```
                    ┌──────────────┐
     Registro ────→│   TRIALING   │ (30 días, acceso completo)
                    └──────┬───────┘
                           │
              ┌────────────┤────────────┐
              │            │            │
         [Paga]    [No paga, día 31]    │
              │            │            │
              ▼            ▼            │
       ┌──────────┐  ┌──────────┐      │
       │  ACTIVE  │  │ BLOCKED  │      │
       └────┬─────┘  │(sin acc. │      │
            │        │total 60d)│      │
     [Cobro falla]   └────┬─────┘      │
            │              │            │
            ▼         [Paga dentro     │
     ┌──────────┐    de 60 días]       │
     │ PAST_DUE │──────────┘            │
     └────┬─────┘                       │
          │                             │
   [7 días sin pago]                    │
          │                             │
          ▼                             │
   ┌────────────┐                       │
   │ SUSPENDED  │ (solo lectura admin;  │
   │            │  jugadores siguen)    │
   └────┬───────┘                       │
        │                               │
  [14 días sin pago]                    │
        │                               │
        ▼                               │
   ┌──────────┐                         │
   │ BLOCKED  │ (sin acceso total)      │
   └────┬─────┘                         │
        │                               │
  [90 días sin pago]                    │
        │                               │
        ▼                               │
   ┌──────────┐                         │
   │ CHURNED  │◄────────────────────────┘
   └────┬─────┘   (60 días post-trial sin pagar)
        │
  [7 días más]
        │
        ▼
   ┌──────────┐
   │ DELETED  │ (datos eliminados/anonimizados)
   └──────────┘

 En CUALQUIER momento antes de CHURNED:
   [Paga] ────→ ACTIVE (datos restaurados)

 CANCELACIÓN VOLUNTARIA:
   ACTIVE ──[cancela]──→ CANCELED ──[fin período]──→ BLOCKED ──[60d]──→ CHURNED ──[7d]──→ DELETED
```

> [!NOTE]
> **BLOCKED → CHURNED (ruta dunning) = 90 días**, contados desde el primer cobro fallido
> (`dunning_started_at`; `BLOCKED_TO_CHURNED_DAYS = 90` en
> `src/modules/billing/lifecycle.service.ts:23`): BLOCKED cae el día 14, CHURNED el día 90,
> DELETED el día 97. La ruta de cancelación voluntaria usa una constante distinta
> (`CANCELED_BLOCKED_DELETION_DAYS = 67`, 60 días de retención + 7 días de espera de borrado,
> contados desde el bloqueo) y no pasa por un estado `churned` explícito antes de eliminarse.
>
> Decisión de auditoría 2026-07-21: reducir la ruta de dunning a 60 días para simplificar los
> crons de churn y alinear con la minimización de datos — **implementación de código PENDIENTE**
> (`lifecycle.service.ts` sigue en 90; `BLOCKED_TO_CHURNED_DAYS` no fue tocado).

### Estados y comportamiento del sistema

| Estado | Acceso admin | Acceso jugador | Cobro | Notificaciones | Color admin interno |
|---|---|---|---|---|---|
| `trialing` | Completo | Completo | No | Onboarding + conversión | 🟡 Amarillo |
| `active` | Completo | Completo | Mensual/anual | Solo eventos de negocio | 🟢 Verde |
| `past_due` | Completo (7 días) | Completo | Reintento automático | Urgentes de pago | 🟠 Naranja |
| `suspended` | Solo lectura | Puede ver reservas, no crear nuevas | Reintento manual | Aviso de suspensión | 🔴 Rojo |
| `blocked` | Sin acceso | Sin acceso | No | Re-activación | ⚫ Gris oscuro |
| `canceled` | Completo hasta fin período | Completo hasta fin período | No (canceló) | Offboarding + retención | ⚫ Gris |
| `churned` | Sin acceso | Sin acceso | No | Re-activación (30, 60 días) | ⚫ Negro |
| `deleted` | N/A | N/A | N/A | N/A | N/A |

> [!IMPORTANT]
> **Estado `suspended` — comportamiento diferenciado:**
> - **Admin:** solo lectura. Puede ver datos pero NO crear reservas, NO cobrar, NO modificar configuración.
> - **Jugadores:** pueden ver sus reservas existentes. Los turnos fijos existentes se mantienen pero NO se generan nuevas instancias.
> - **Recordatorios:** se siguen enviando por email para reservas ya existentes.
> - **Razón:** no castigar a los clientes finales (jugadores) por la deuda del tenant. Genera confianza.

---

## 3. Flujo de Trial → Conversión

### Configuración

| Parámetro | Valor | Configurable |
|---|---|---|
| Duración del trial | 30 días | No (fijo v1) |
| Acceso durante trial | Completo (todas las features del plan Full) | No |
| Trial extendido | No existe | — |
| Datos post-trial | Conservados 60 días en modo solo lectura | No |

### Cronograma de Notificaciones (Trial) — ÚNICO Y DEFINITIVO

| Día | Canal | Tipo | Contenido |
|---|---|---|---|
| 0 | 📩 Email | Automático | Bienvenida + link al wizard de onboarding |
| 1 | 📩 Email | Automático | Si no completó onboarding: "¿Necesitás ayuda para configurar?" |
| 7 | 📩 Email | Automático | "¿Cómo va todo? 3 funciones que quizás no viste" [tips de uso] |
| 14 | 📩 Email | Automático | "Vas por la mitad. ¿Ya recibiste tu primera reserva?" |
| 21 | 📩 Email | Automático | "Quedan 9 días de tu prueba. ¿Seguís con nosotros?" + CTA "Elegir mi plan" |
| 25 | 📩 Email | Automático | "Antes de que venza tu prueba: ¿qué te faltó?" (feedback + retención) |
| 28 | 📩 Email | **Humano** | Email personalizado del equipo (high-touch, crítico para conversión) |
| 30 | 📩 Email | Automático | "Último día. Suscribite para no perder acceso." |
| 31 | 📩 Email | Automático | "Tu prueba venció. Tus datos están seguros 60 días." + estado → BLOCKED |
| 37 | 📩 Email | Automático | "Te perdimos. Contanos qué pasó." (win-back) |

> [!WARNING]
> **Aspiracional, no implementado (auditado 2026-08-27).** El código real (`TRIAL_ENDING_WARNING_DAYS` en
> `src/shared/constants.ts`) solo dispara 2 de estos 10 checkpoints: día 1 y día 7. Los 8 restantes
> (14, 21, 25, 28 humano, 30, 31, 37) no tienen worker ni template que los mande — "ÚNICO Y DEFINITIVO"
> describe el diseño querido, no el estado actual. Antes de prometer este cronograma a soporte/marketing,
> confirmar si se construye el resto o se recorta el diseño a los 2 avisos reales.

> [!NOTE]
> **Canal v1: solo email.** WhatsApp Business API se evalúa para v1.5 cuando haya escala para
> negociar tarifas con un BSP argentino. Su modelo de costos lo hace inviable como canal primario
> en fase temprana: Meta tarifa **por conversación iniciada** (ventana de 24 h) más el markup del
> BSP, y exige contrato con un BSP + aprobación de plantillas — frente al costo marginal casi nulo
> del email. Sin volumen para negociar tarifa, el costo por notificación es sustancialmente mayor.
> Email es gratuito hasta ~100 envíos/día con los tiers free de Resend/SendGrid. (Ver ADR-003.)

---

## 4. Flujo de Dunning (Cobro Fallido) — ÚNICO Y DEFINITIVO

> El dunning es el proceso de recuperación de cobros fallidos. Sin esto, se pierde el 15-20% del MRR.

### Configuración

| Parámetro | Valor | Configurable |
|---|---|---|
| Reintentos de cobro | 3 (día 0, 2, 5) | No |
| Gracia con acceso completo | 7 días (estado PAST_DUE) | No |
| Solo lectura admin | Día 7-14 (estado SUSPENDED) | No |
| Bloqueo total | Día 14+ (estado BLOCKED) | No |
| Churn | Día 90 (estado CHURNED) | No |
| Eliminación de datos | Día 97 (estado DELETED) | No |

### Timeline Visual

```
DÍA 0      DÍA 2      DÍA 5      DÍA 7       DÍA 14      DÍA 90     DÍA 97
  │          │          │          │            │            │           │
  ▼          ▼          ▼          ▼            ▼            ▼           ▼
FALLA ─── retry ─── retry ─── SUSPENDED ── BLOCKED ──── CHURNED ── DELETED
         + email    + email    (admin r/o    (sin         (archivado) (definitivo)
                               jugadores    acceso)
                               siguen)
```

### Detalle de comunicaciones (dunning)

| Día | Email | Acción del sistema |
|---|---|---|
| 0 | "No pudimos procesar tu pago. Revisá tu método de pago → [link]" | Intento de cobro fallido |
| 2 | "Segundo intento fallido. Quedan 5 días para regularizar." | Reintento automático MP |
| 5 | "Tercer intento fallido. Tu cuenta se suspende en 2 días." | Último reintento |
| 7 | "Tu cuenta fue suspendida. Podés ver tus datos pero no operar." | Estado → SUSPENDED |
| 14 | "Tu cuenta fue bloqueada por falta de pago. Regularizá para recuperar acceso." | Estado → BLOCKED |
| 60 | "Tus datos se eliminan en 30 días. ¿Querés recuperar tu cuenta?" | Recordatorio de eliminación |
| 90 | "Tus datos se borran en 7 días. Recuperá tu cuenta ahora →" | Estado → CHURNED |
| 97 | (no se envía) | Estado → DELETED, datos eliminados |

---

## 5. El Problema del ARS Volátil

> Este es un problema específico de Argentina que la mayoría de los SaaS internacionales ignoran.

### El problema
- La inflación en Argentina obliga a actualizar precios frecuentemente (cada 3 meses, ver la nota de revisión de precios en §Planes)
- MercadoPago Suscripciones permite actualizar el precio de una suscripción existente
- Hay que notificar al cliente con anticipación (ética + legal)
- Los clientes con plan anual pagaron por adelantado → precio fijo todo el año

### Estrategia

**Clientes en plan MENSUAL:**
- Notificación 30 días antes del próximo cobro (email)
- "A partir del [fecha], tu plan pasa de $X a $Y/mes. Si querés, podés cambiar a plan anual antes del cambio."
- Si no hace nada: se actualiza automáticamente
- Si cancela por eso: registramos el motivo (feedback de precio)

**Clientes en plan ANUAL:**
- El precio no cambia hasta que renueve (decisión de producto aceptada)
- Al momento de renovación: se ofrece el nuevo precio anual
- Si aceptan: continúan. Si no: pueden cancelar sin cargo.

> [!WARNING]
> **Riesgo aceptado:** con inflación 100%+ anual, los últimos 3-4 meses del plan anual se cobran
> a pérdida en términos reales. Es un riesgo comercial aceptado conscientemente a cambio de
> atracción comercial. Revisar cuando haya datos reales de % de clientes en plan anual.

### Implicancia técnica
- Campo `price_locked_until` en la suscripción para clientes anuales
- Los precios en la DB son históricos (no se edita el precio actual, se crea una nueva versión)
- Tabla `price_versions` con fecha de vigencia
- Middleware que determina qué precio aplica a cada tenant según su `subscription_start_date`

### Devaluación brusca (step-devaluation) — política v1

La estrategia de arriba cubre la inflación *gradual*. Aparte queda el escenario, recurrente en
Argentina, de una **devaluación brusca** del ARS que encarece de un día para el otro los costos
dolarizados (Vercel, Supabase, Resend, dominio) mientras el ingreso en pesos queda congelado
(anuales hasta 12 meses; mensuales con 30 días de preaviso).

Política v1 (Decisión de auditoría 2026-07-21 — ARG-07):
- **Sin hedging financiero** ni colchón en USD en v1: es complejidad operativa que un equipo de
  1-3 personas no va a sostener.
- **Gatillo de repricing extraordinario** para clientes MENSUALES: ante un salto de tipo de cambio
  material (fuera del ciclo normal de revisión de precios), se puede subir el precio antes de los
  3 meses, respetando **siempre** el preaviso de 30 días. Es la misma mecánica de la Estrategia de
  arriba, disparada por FX en vez de por calendario.
- **Clientes ANUALES**: el prepago los deja expuestos al costo dolarizado del período ya cobrado,
  pero ese prepago **es en sí un hedge** — ya cobramos los pesos por adelantado y podemos
  desplegarlos; la exposición se acota a ese período (riesgo ya aceptado en el WARNING de arriba).

---

## 6. Upgrades y Downgrades

### Upgrade (de Predio a Complejo, etc.)

**Cuándo pasa**: El dueño agrega más canchas que su plan permite.

```
Admin intenta crear la cancha N+1 (supera el límite del plan)
      ↓
Sistema muestra modal: "Tu plan Predio permite hasta 3 canchas.
Actualizá a Complejo para agregar más canchas."
[CTA: Actualizar a Complejo - $99.000/mes]   ← el "+ IVA" se saca hasta resolver el REQUIERE INPUT de §1
      ↓
Si confirma:
  - Calcula el prorrateo de días restantes del período actual
  - Cobra la diferencia en el momento (via MP Checkout, no suscripción)
  - Activa el nuevo plan inmediatamente
  - Email: "🎉 Actualizado a plan Complejo. Ya podés agregar más canchas."
```

**Fórmula de prorrateo:**
```
días_restantes = fecha_fin_período - hoy
precio_día_nuevo = precio_nuevo / días_del_período
precio_día_viejo = precio_viejo / días_del_período
cargo_extra = (precio_día_nuevo - precio_día_viejo) * días_restantes
```

### Downgrade (de Complejo a Predio, etc.)

**Regla**: No se puede hacer downgrade si tenés más canchas activas de las que permite el plan inferior.
```
Admin intenta bajar de Complejo (4-6 canchas) a Predio (1-3) pero tiene 5 canchas configuradas
      ↓
Sistema: "Para cambiar al plan Predio necesitás tener máximo 3 canchas activas.
Desactivá 2 canchas primero."
      ↓
Si el dueño desactiva la cancha → puede hacer downgrade
      ↓
El downgrade aplica al inicio del próximo período (no inmediato)
No se genera reembolso por días no usados del plan superior
```

> [!NOTE]
> **Downgrade con plan ANUAL vigente** (Decisión de auditoría 2026-07-21 — LOG-09/GAP-10):
> el downgrade de un cliente anual **aplica recién en la renovación** (fin del término pagado),
> nunca a mitad del año. NO se recalcula ni se reembolsa el prepago (consistente con la regla
> general "sin reembolso"), y el precio congelado por `price_locked_until` rige hasta el
> vencimiento. En la renovación se le ofrece el plan inferior al precio vigente de ese momento.

### Efectos cascada de cambio de plan

| Escenario | Qué pasa |
|---|---|
| Downgrade con turnos fijos en cancha desactivada | Admin debe cancelar los turnos fijos de esa cancha primero |
| Downgrade con reservas futuras en cancha desactivada | Warning: "Hay {N} reservas futuras. Se cancelarán si desactivás." |
| Upgrade de plan | Inmediato, sin efectos colaterales negativos |

---

## 7. Integración con MercadoPago

### Dos flujos de MP separados

TurnoGol usa MercadoPago en **dos contextos completamente distintos**:

| Contexto | Producto MP | Cuenta MP | Quién paga | Quién recibe |
|---|---|---|---|---|
| **Suscripción SaaS** | MP Suscripciones | Cuenta de TurnoGol | El tenant (Marcelo) | TurnoGol |
| **Señas de reserva** | MP Checkout | Cuenta del complejo (OAuth) | El jugador (Tomás) | El complejo |

> [!IMPORTANT]
> **TurnoGol NUNCA toca el dinero de las señas.** El complejo conecta su cuenta de MP vía OAuth
> durante el onboarding. TurnoGol genera links de pago con las credenciales del complejo.
> El dinero va directo del jugador al complejo. TurnoGol no es intermediario financiero.

### Flujo de señas — Spec de referencia

**Configuración del complejo (en el wizard de onboarding):**
- `deposit_percentage`: porcentaje de seña (default 30%, configurable **10-100%** cuando `requires_deposit` está ON). "Sin seña" se expresa con el toggle `requires_deposit` en OFF, NUNCA con 0% (un 0% dispararía un checkout de MP por $0). (Decisión de auditoría 2026-07-21: rango unificado a 10-100%, consistente con doc8)
- `cancellation_policy_hours`: horas antes para cancelar con reembolso (configurable, default 12hs)
- `cancellation_refund_percentage`: % de reembolso si cancela dentro del plazo (configurable)
- `requires_deposit`: boolean — si el complejo cobra seña online o no

**Flujo del jugador que reserva con seña:**
```
Jugador selecciona cancha + horario en TurnoGol
      ↓
Sistema calcula seña: precio_turno × deposit_percentage
Sistema crea Preference de MP Checkout con credenciales OAuth del complejo
      ↓
Jugador es redirigido al checkout de MercadoPago
      ↓
MP procesa el pago → webhook a TurnoGol
      ↓
TurnoGol recibe webhook → confirma la reserva
Booking.status = 'confirmed', Booking.deposit_status = 'paid'
Email al jugador: "Tu reserva está confirmada 🎉"
      ↓
Si el jugador no paga en 6 minutos → Booking.status = 'expired', slot se libera
```

> [!IMPORTANT]
> **La Preference de la seña excluye medios diferidos/offline.** Se restringe a medios instantáneos
> (tarjeta de crédito/débito + dinero en cuenta de MP) excluyendo `ticket` (Rapipago, PagoFácil), `atm`
> (cajero offline) y `bank_transfer` (transferencia/CBU) vía `excluded_payment_types`. Un medio offline
> es incompatible con el timeout de 6 minutos: el jugador se llevaría un cupón para pagar horas después,
> dejando el slot en un limbo (bloqueado o con confirmación tardía). Config concreta de la Preference en
> doc11 ADR-004. Implementado: `DEPOSIT_EXCLUDED_PAYMENT_TYPES` en
> `src/modules/payments/mp-gateway.implementation.ts` (`createPreference`).

**Flujo de cancelación con seña:**
```
Jugador cancela la reserva
      ↓
Sistema evalúa cancellation_policy del complejo:
  - Si cancela con > X horas de anticipación → deposit_status = 'refunded',
    la devolución queda REGISTRADA como deuda del complejo (no se ejecuta por
    API) y aparece en /caja/devoluciones para que el complejo la haga a mano
  - Si cancela con < X horas → seña retenida (va al complejo)
      ↓
Si la seña fue pagada en efectivo (reserva manual del admin):
  → Mismo camino: se registra como devolución pendiente en /caja/devoluciones
  → Mensaje: "Contactá al complejo para el reembolso de tu seña."
```

> [!IMPORTANT]
> **No hay reembolso automático vía API de MercadoPago (revertido).** MP deriva el permiso
> `payments:refunds` del producto de la aplicación y no se puede dar por concedido: la cuenta
> del complejo típico (un tercero, no el dueño de la app) daba 403 en todos los intentos. El
> camino automático se ELIMINÓ (PR #212); hoy el sistema solo **registra** la devolución que el
> complejo queda debiendo (`registerRefundDue`, `src/modules/bookings/booking.cancellation.ts`)
> y la lista en `/caja/devoluciones`. Ver `CLAUDE.md` (sección MercadoPago) y
> `docs/decisions/` (reembolso automático descartado).

**Comisión MP:** la absorbe el complejo (~5% de Checkout Pro sobre la seña; distinta del 2.99% de MP Suscripciones sobre la cuota SaaS). El complejo recibe el monto neto.
No se modela fee explícitamente en v1 — el complejo ve lo que MP le deposita en su cuenta.

> [!NOTE]
> **Retención de fondos / KYC de MP (cuentas nuevas).** MercadoPago puede retener temporalmente el dinero
> de las señas ("dinero a liberar") en cuentas recién conectadas o de bajo volumen que aún están pendientes
> de verificación (KYC / validación de CUIT). La disponibilidad efectiva del dinero depende exclusivamente
> de MP, no de TurnoGol: TurnoGol no intermedia ni acelera esos fondos (ver §7, "TurnoGol NUNCA toca el
> dinero de las señas"). (Decisión de auditoría 2026-07-21. La copy de onboarding que le explica esto al
> dueño vive en doc10.)

**Chargeback/disputa:** responsabilidad del complejo (es su cuenta MP). TurnoGol puede proveer audit trail (booking + timestamps + confirmaciones) como evidencia para la disputa.

### Webhooks de suscripción SaaS

| Evento de MP | Qué hacemos en TurnoGol |
|---|---|
| `subscription.created` | Registrar suscripción, cambiar estado a `active` |
| `payment.approved` | Extender el período, registrar en tabla de pagos, email de confirmación |
| `payment.rejected` | Iniciar flujo de dunning |
| `payment.pending` | No hacer nada (MP sigue intentando) |
| `subscription.canceled` | Cambiar estado a `canceled`, iniciar offboarding |
| `subscription.paused` | Bloquear acceso (estado `suspended`) |

### Webhooks de señas (MP Checkout del complejo)

| Evento de MP | Qué hacemos en TurnoGol |
|---|---|
| `payment.approved` | Confirmar booking, setear deposit_status = 'paid' |
| `payment.rejected` | No modificar booking (sigue pending_payment, timer de 6 min sigue) |
| `payment.refunded` | Actualizar deposit_status = 'refunded' |

> [!IMPORTANT]
> Los webhooks de MercadoPago pueden llegar **duplicados, fuera de orden, o con demora**.
> El sistema tiene que ser **idempotente**: procesar el mismo webhook 2 veces no debe generar
> 2 pagos registrados. Solución: tabla `processed_webhooks` con `mp_event_id` como check.

---

## 8. Diferenciación entre planes

> Retirada la tabla de "Feature Flags por Plan" (2026-08-27, auditoría de docs) — prometía gates de historial de
> reservas, exportación CSV vs CSV+Excel, API access y soporte prioritario que no existen en el código: todos los
> planes tienen exactamente las mismas features hoy. El único diferenciador real entre Predio/Complejo/Estadio es
> la cantidad de canchas (`plans.max_courts`, ver §1) y el precio. Si se quiere diferenciar por feature en el
> futuro, es una decisión de producto a tomar explícitamente, no algo que este doc deba dar por hecho.

> [!NOTE]
> **Regla de diseño para cuando exista algún límite real (ej. cantidad de canchas)**: El sistema NUNCA muestra un
> error crudo cuando se supera un límite. Siempre muestra un mensaje que explica el límite, la solución, y un CTA
> de upgrade claro. Ejemplo: "Tu plan permite 3 canchas. Para agregar más, actualizá a Complejo →"

---

## 9. Cancelación Voluntaria

| Parámetro | Valor | Configurable |
|---|---|---|
| Retención (oferta de downgrade) | Roadmap, no implementado (auditado 2026-08-27): la UI real (`CancelSubscriptionSection.tsx`) es un campo de texto libre para el motivo, sin flujo estructurado ni oferta de downgrade | No |
| Acceso post-cancelación | Hasta fin del período pago | No |
| Datos post-expiración | 60 días en BLOCKED | No |
| Reembolso del período restante | No | No |
| Exportación de datos | Sí (CSV) | No |

### Acciones automáticas al expirar el período (post-cancelación)
1. Estado → BLOCKED (sin acceso) — `transitionCanceledToBlocked`, `lifecycle.service.ts`
2. Turnos fijos (abonados): **NO se cancelan ni se avisa al admin.** El único efecto implementado
   es que `generate-abonado-slots.worker.ts` deja de generarles nuevas instancias
   (`SKIP_STATUSES` incluye `blocked`) — las filas de `abonados` siguen `active` en la DB. No hay
   `email a contactos del admin` sobre esto en ningún lado del código (barrido 2026-08-27). Este
   punto describe una automatización que no está construida.
3. Reservas futuras: se mantienen hasta su fecha, después no se generan nuevas
4. Página pública del complejo: se oculta (mensaje real: "Este complejo no está disponible
   temporalmente", `src/app/(public)/[slug]/page.tsx`; la copy de arriba es ilustrativa)
5. Iniciar cuenta regresiva de 60 días → CHURNED → 7 días → DELETED

---

## 10. Tabla Completa: Decisión de Negocio → Requisito Técnico

| Decisión de negocio | Requisito técnico concreto |
|---|---|
| Trial de 30 días sin tarjeta | Campo `trial_ends_at` en `tenants`. Cron job diario que evalúa expiración. |
| 3 planes por cantidad de canchas | Tabla `plans` con `max_courts`. Middleware que valida al crear cancha. |
| Pago mensual y anual | Campo `billing_cycle` (monthly/annual) en suscripción. |
| Descuento 20% anual | Calculado en el momento del checkout, no como cupón. Precio base almacenado. |
| IVA excluido (se suma en checkout) | Campo `price_without_tax` en la tabla plans; cálculo de IVA 21% en checkout. |
| 8 estados del tenant | ENUM `tenant_status` con 8 valores. Middleware en todos los endpoints que verifica estado. |
| SUSPENDED = admin r/o, jugadores siguen | Middleware diferenciado por rol: bloquea escritura admin, permite lectura jugador. |
| Dunning: 3 reintentos en 5 días | MP lo maneja los reintentos. Nosotros procesamos webhooks de `payment.rejected`. |
| Datos conservados post-churn | Cancelación voluntaria: 60d BLOCKED → CHURNED → 7d → DELETED (67d total). Dunning: 90d post-primer-fallo → CHURNED → 7d → DELETED (97d total). Campo `scheduled_deletion_at` en `tenants`. (Decisión de auditoría 2026-07-21: evaluar reducir la ruta de dunning a 60 días — implementación de código PENDIENTE, ver nota en §2.) |
| Notificaciones de trial por email | Scheduled jobs en pg-boss (tabla `pgboss.job`). Ver ADR-005. |
| Upgrade con prorrateo | Cálculo al momento del upgrade. Cargo vía MP Checkout (no suscripción). |
| Downgrade solo al inicio del próximo período | Campo `pending_plan_change` + cron job que lo aplica en la fecha de renovación. |
| ARS volátil: precios históricos | Tabla `price_versions` con `valid_from`. |
| Webhook idempotencia | Tabla `processed_webhooks` con `mp_event_id`. Check antes de procesar. |
| Señas van directo al complejo | OAuth del complejo durante onboarding. TurnoGol no intermedia fondos. |
| Política de cancelación configurable | Campos `cancellation_policy_hours` y `deposit_percentage` en tenant settings. |
| Seña en efectivo desde mostrador | `payment_method = 'cash'` en booking. Sin refund automático al cancelar. |

---

## 11. Unit Economics

> No es un documento contable. Es para entender qué escala necesitamos para ser viables.

> [!NOTE]
> **Precios desactualizados.** La tabla de abajo usa los precios PRE-migr. 071 ($55.000/$85.000/
> $115.000). Los vigentes desde 2026-08-07 son $63.000/$99.000/$129.000 (ver §1) — el MRR y la
> comisión de MP de más abajo están calculados con los precios viejos y no se recalcularon.

### Con 100 clientes activos (mix estimado)

| Plan | Clientes | Precio/mes (sin IVA) | MRR |
|---|---|---|---|
| Predio (mensual) | 50 | $55.000 | $2.750.000 |
| Complejo (mensual) | 35 | $85.000 | $2.975.000 |
| Estadio (mensual) | 15 | $115.000 | $1.725.000 |
| **Total MRR** | **100** | | **$7.450.000 ARS** |

### Costos fijos estimados (infraestructura, sin equipo)
- Hosting/infra (Vercel + Supabase Pro): ~$150.000-300.000 ARS/mes
- Emails transaccionales (Resend/SendGrid): ~$0-20.000 ARS/mes (tier free cubre v1)
- Worker externo (Railway): ~$5-15.000 ARS/mes
- MercadoPago comisiones sobre suscripción SaaS: ~2.99% del MRR ≈ $228.000 ARS/mes

**Break-even de infraestructura**: con 10-20 clientes activos.
**El negocio escala bien**: los costos variables son mínimos respecto al MRR.

> [!TIP]
> La conversión del trial es la métrica más crítica en los primeros 6 meses.
> Target: 30-40% de conversión trial → pago (industria SaaS promedio: 25%).

---

## 12. Métricas de Negocio a Trackear

| Métrica | Cálculo | Importancia |
|---|---|---|
| **Trial → Paid Conversion** | tenants que pagan / tenants que empiezan trial | Crítica |
| **Monthly Churn Rate** | tenants que churnan este mes / tenants activos inicio de mes | Crítica |
| **MRR** | Σ(precio plan × tenants por plan) | Crítica |
| **ARPU** | MRR / total tenants activos | Importante |
| **LTV** | ARPU / churn_rate | Importante |
| **Dunning Recovery Rate** | cobros recuperados en dunning / cobros fallidos totales | Importante |
| **Time to First Booking** | horas desde registro hasta primera reserva online | Crítica (onboarding) |
| **Day-30 Retention** | tenants activos a los 30 días / tenants registrados | Crítica |
| **Deposit Adoption Rate** | % de reservas con seña pagada online / total reservas | Importante |

---

## 13. Entidades Involucradas (referencia)

```
TenantSubscription
  ├── plan_id ──────────────→ Plan (global)
  ├── status: trialing | active | past_due | suspended | blocked | canceled | churned
  ├── billing_cycle: monthly | annual
  ├── mp_subscription_id ──→ MercadoPago Suscripción
  ├── current_period_start
  ├── current_period_end
  ├── canceled_at (si canceló voluntariamente)
  ├── cancellation_reason
  ├── price_locked_until (si anual)
  ├── pending_plan_change (si hay downgrade pendiente)
  └── scheduled_deletion_at (60+7 días post-bloqueo)
```

> [!NOTE]
> **Ortografía canónica:** se usa `canceled` (americano, una L) en todos los ENUMs del sistema.
> No usar `cancelled` (británico, doble L). Esto aplica a todos los docs y al schema de DB.
