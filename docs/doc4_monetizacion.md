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
| **Básico** | 1 – 3 canchas | $55.000 ARS | $36.850 ARS (33% off) | $217.800 ARS |
| **Estándar** | 4 – 6 canchas | $88.000 ARS | $58.960 ARS (33% off) | $348.480 ARS |
| **Full** | 7+ canchas | $120.000 ARS | $80.400 ARS (33% off) | $475.200 ARS |

> [!NOTE]
> Precios establecidos ligeramente por debajo de ATC Sports como estrategia de captación inicial.
> ATC cobra $60.500 / $95.000 / $125.000 ARS/mes (datos Q1 2025).
> Revisar precios cada 3 meses dado el IPC argentino (ver sección 5: ARS volátil).
> **Precios NO incluyen IVA** — se agrega 21% en el checkout.

**Trial**: 30 días gratis, sin tarjeta requerida al inicio.
**Sin costos de instalación, capacitación ni mantenimiento** (igual que ATC, ya es expectativa del mercado).

---

### Diferenciadores incluidos en todos los planes
- Dashboard analytics visual
- Onboarding self-service con UX guiada paso a paso
- Reservas online con pago de seña vía MercadoPago
- Gestión de turnos fijos (abonados) desde la grilla del admin
- Staff del sistema: 2 (Básico), 5 (Estándar), ilimitado (Full)

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

> [!NOTE]
> **Canal v1: solo email.** WhatsApp Business API se evalúa para v1.5 cuando haya escala para
> negociar tarifas con un BSP argentino. Los costos de WA a escala (estimados en 30-300x más
> de lo presupuestado originalmente) hacen inviable usarlo como canal primario en fase temprana.
> Email es gratuito hasta ~100 envíos/día con Resend/SendGrid tiers free.

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
- La inflación en Argentina obliga a actualizar precios frecuentemente (cada 3-6 meses estimado)
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

---

## 6. Upgrades y Downgrades

### Upgrade (de Básico a Estándar, etc.)

**Cuándo pasa**: El dueño agrega más canchas que su plan permite.

```
Admin intenta crear la cancha N+1 (supera el límite del plan)
      ↓
Sistema muestra modal: "Tu plan Básico permite hasta 3 canchas.
Actualizá a Estándar para agregar más canchas."
[CTA: Actualizar a Estándar - $88.000/mes + IVA]
      ↓
Si confirma:
  - Calcula el prorrateo de días restantes del período actual
  - Cobra la diferencia en el momento (via MP Checkout, no suscripción)
  - Activa el nuevo plan inmediatamente
  - Email: "🎉 Actualizado a plan Estándar. Ya podés agregar más canchas."
```

**Fórmula de prorrateo:**
```
días_restantes = fecha_fin_período - hoy
precio_día_nuevo = precio_nuevo / días_del_período
precio_día_viejo = precio_viejo / días_del_período
cargo_extra = (precio_día_nuevo - precio_día_viejo) * días_restantes
```

### Downgrade (de Estándar a Básico, etc.)

**Regla**: No se puede hacer downgrade si tenés más canchas activas de las que permite el plan inferior.
```
Admin intenta bajar de Estándar (4-6 canchas) a Básico (1-3) pero tiene 4 canchas configuradas
      ↓
Sistema: "Para cambiar al plan Básico necesitás tener máximo 3 canchas activas.
Desactivá 1 cancha primero."
      ↓
Si el dueño desactiva la cancha → puede hacer downgrade
      ↓
El downgrade aplica al inicio del próximo período (no inmediato)
No se genera reembolso por días no usados del plan superior
```

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
- `deposit_percentage`: porcentaje de seña (default 30%, configurable 0-100%)
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
Si el jugador no paga en 15 minutos → Booking.status = 'expired', slot se libera
```

**Flujo de cancelación con seña:**
```
Jugador cancela la reserva
      ↓
Sistema evalúa cancellation_policy del complejo:
  - Si cancela con > X horas de anticipación → refund automático vía MP
  - Si cancela con < X horas → seña retenida (va al complejo)
      ↓
Si la seña fue pagada en efectivo (reserva manual del admin):
  → No hay refund automático
  → Mensaje: "Contactá al complejo para el reembolso de tu seña."
```

**Comisión MP:** la absorbe el complejo (~5-7%). El complejo recibe el monto neto.
No se modela fee explícitamente en v1 — el complejo ve lo que MP le deposita en su cuenta.

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
| `payment.rejected` | No modificar booking (sigue pending_payment, timer de 15 min sigue) |
| `payment.pending` (in_process) | Extender timer a 48hs (CBU/transferencia puede tardar) |
| `payment.refunded` | Actualizar deposit_status = 'refunded' |

> [!IMPORTANT]
> Los webhooks de MercadoPago pueden llegar **duplicados, fuera de orden, o con demora**.
> El sistema tiene que ser **idempotente**: procesar el mismo webhook 2 veces no debe generar
> 2 pagos registrados. Solución: tabla `processed_webhooks` con `mp_event_id` como check.

---

## 8. Feature Flags por Plan

> Los feature flags definen qué puede hacer cada plan.
> Tienen que estar en la DB (no hardcodeados) para poder cambiarlos sin deployar.

| Feature | Básico (1-3) | Estándar (4-6) | Full (7+) |
|---|:---:|:---:|:---:|
| Cantidad máxima de canchas | 3 | 6 | Ilimitado |
| Usuarios del sistema (staff) | 2 | 5 | Ilimitado |
| Historial de reservas | 6 meses | 12 meses | Ilimitado |
| Reportes avanzados | ❌ | ✅ | ✅ |
| Exportación de datos | CSV básico | CSV completo | CSV + Excel |
| API access (futuro) | ❌ | ❌ | ✅ |
| Soporte | Email | Email | Email prioritario |

> [!NOTE]
> **Regla de diseño de feature flags**: El sistema NUNCA muestra un error crudo cuando se supera un límite.
> Siempre muestra un mensaje que explica el límite, la solución, y un CTA de upgrade claro.
> Ejemplo: "Tu plan permite 3 canchas. Para agregar más, actualizá a Estándar →"

---

## 9. Cancelación Voluntaria

| Parámetro | Valor | Configurable |
|---|---|---|
| Retención (oferta de downgrade) | Sí, para "muy caro" y "no lo uso" | No |
| Acceso post-cancelación | Hasta fin del período pago | No |
| Datos post-expiración | 60 días en BLOCKED | No |
| Reembolso del período restante | No | No |
| Exportación de datos | Sí (CSV) | No |

### Acciones automáticas al expirar el período (post-cancelación)
1. Estado → BLOCKED (sin acceso)
2. Cancelar todos los turnos fijos (abonados) activos → email a contactos del admin
3. Reservas futuras: se mantienen hasta su fecha, después no se generan nuevas
4. Página pública del complejo: "Este complejo ya no está en TurnoGol"
5. Iniciar cuenta regresiva de 60 días → CHURNED → 7 días → DELETED

---

## 10. Tabla Completa: Decisión de Negocio → Requisito Técnico

| Decisión de negocio | Requisito técnico concreto |
|---|---|
| Trial de 30 días sin tarjeta | Campo `trial_ends_at` en `tenants`. Cron job diario que evalúa expiración. |
| 3 planes por cantidad de canchas | Tabla `plans` con `max_courts`. Middleware que valida al crear cancha. |
| Pago mensual y anual | Campo `billing_cycle` (monthly/annual) en suscripción. |
| Descuento 33% anual | Calculado en el momento del checkout, no como cupón. Precio base almacenado. |
| IVA excluido (se suma en checkout) | Campo `price_without_tax` en la tabla plans; cálculo de IVA 21% en checkout. |
| 8 estados del tenant | ENUM `tenant_status` con 8 valores. Middleware en todos los endpoints que verifica estado. |
| SUSPENDED = admin r/o, jugadores siguen | Middleware diferenciado por rol: bloquea escritura admin, permite lectura jugador. |
| Dunning: 3 reintentos en 5 días | MP lo maneja los reintentos. Nosotros procesamos webhooks de `payment.rejected`. |
| Datos conservados post-churn | Cancelación voluntaria: 60d BLOCKED → CHURNED → 7d → DELETED (67d total). Dunning: 90d post-primer-fallo → CHURNED → 7d → DELETED (97d total). Campo `scheduled_deletion_at` en `tenants`. |
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

### Con 100 clientes activos (mix estimado)

| Plan | Clientes | Precio/mes (sin IVA) | MRR |
|---|---|---|---|
| Básico (mensual) | 50 | $55.000 | $2.750.000 |
| Estándar (mensual) | 35 | $88.000 | $3.080.000 |
| Full (mensual) | 15 | $120.000 | $1.800.000 |
| **Total MRR** | **100** | | **$7.630.000 ARS** |

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
  ├── status: trialing | active | past_due | suspended | canceled | churned
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
