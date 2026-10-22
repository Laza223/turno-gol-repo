# Solo lectura al vencer la prueba

**Estado**: aprobada por Lazar el 2026-10-22. Respondió por select las 4 preguntas y en las cuatro eligió la opción recomendada. Supera, para el vencimiento de la prueba, el diagrama de doc4 §2 ("No paga, día 31 → BLOCKED"). El mismo día, después de #487, sumó dos decisiones: las devoluciones se pueden marcar en solo lectura, y va un mail al entrar en solo lectura (pendiente de programar).

## Decisión

Cuando vence la prueba y el complejo no pagó, **no queda bloqueado de golpe**. Pasa a **solo lectura** durante **14 días**, y recién después a `blocked`.

| Pregunta                           | Respuesta                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ¿Qué estado?                       | Se reusa **`suspended`**. No hay migración de enum.                                                                            |
| ¿El portal sigue tomando reservas? | **No**. El portal muestra "no disponible", como ya pasaba con `suspended`. Los jugadores conservan las reservas que ya tenían. |
| ¿Cuánto dura?                      | **14 días**, el mismo escalón que `suspended → blocked` en la mora por cobro fallido. Después, `blocked`.                      |
| ¿Quién entra a mirar?              | **El dueño y el encargado**. Solo el dueño ve el botón para activar el plan. El encargado ve "Avisale al dueño".               |

### Qué puede hacer en solo lectura

- Entrar al panel y ver Hoy, grilla, reservas, jugadores, abonados y caja. El dueño ve además Métricas y Ajustes.
- Exportar sus datos desde Ajustes → Tus datos (`/settings/datos`, #476). La página y `runExport` piden el guard con `allowReadOnly`.
- **Marcar como hecha una devolución pendiente** (Caja → Cuentas → Devolvés), la seña de un jugador que canceló. Decisión de Lazar del 2026-10-22, posterior a #487: la plata es del jugador, y el complejo tiene que poder registrar que se la devolvió aunque no haya pagado el plan.
  - Es la **única escritura** que anda en solo lectura. `markRefundSettledAction` (`caja/devoluciones/actions.ts`) pide el guard con `allowReadOnly`.
  - Si se devolvió en efectivo o por transferencia, el egreso entra a la caja igual que fuera del solo lectura.
  - El dueño y el encargado pueden marcarla, igual que fuera del solo lectura.
- Activar el plan desde `/reactivar`. `reactivate()` ya acepta `suspended` y, cuando el pago entra, `onPaymentApproved` lo pasa a `active` (`transitionToActiveFromAny`).

### Qué no puede hacer

- Ninguna escritura fuera de la devolución: crear, mover o cancelar reservas, cobrar, cargar abonados, cambiar la configuración ni el equipo.
- De caja, nada más que la devolución: ni ventas, ni cobros de deudas o fiados, ni movimientos.
- Lo corta el guard central de Server Actions (`requireStaffWithRole`, `src/modules/staff/guards.ts`) y `withTenant` para las rutas de API. No se toca acción por acción.
- `allowReadOnly` es opt-in, y fuera de las pages y layouts la lista de archivos que lo nombran es cerrada: el guard, el export, la devolución y `requireCajaContext` (el guard de las pages de Caja). `tests/unit/caja-solo-lectura.test.ts` falla si aparece en otro archivo, si una page declara una Server Action adentro o si algo que no es una page usa `requireCajaContext`. Sumar uno necesita una decisión del dueño.
- Las de facturación (`requireBillingAdminStaffAction`, `withBillingTenant`) siguen abiertas a propósito: son la salida.
- Los pasos previos a una escritura (vista previa, buscador de jugadores, impacto de pausar una cancha) también rebotan. El aviso llega antes de llenar el formulario.
- Conectar o cambiar la cuenta de MercadoPago de las señas: `/api/mp/oauth-start` no pasa por el guard, así que corta por su cuenta.
- Darse de baja con la prueba vencida: `/reactivar` no le muestra "Dar de baja", igual que en `trialing`, porque nunca eligió plan. Antes la prueba vencida iba directo a `blocked`, que tampoco lo mostraba. La mora sí lo ve. Es un corte de UI, como el de `trialing`: la FSM (`transitionToCanceled`) no cambia.
- No se generan nuevas instancias de turnos fijos. `generate-abonado-slots` ya saltea `suspended`.

### Cómo se distingue del `suspended` por mora

- Prueba vencida: `suspended` con `tenant_subscriptions.dunning_started_at IS NULL`.
- Mora: `suspended` con `dunning_started_at` cargado.

Cambian solo el texto del aviso y el barrido que lo pasa a `blocked`. El de la mora sigue en `dunning-retry` y no se toca.

### Cuándo pasa a `blocked`

- Fecha de corte: `trial_ends_at` + 14 días. Al que ya tocó "Activar" (`mp_subscription_id`) se le suman los `SUBSCRIBED_TRIAL_GRACE_DAYS` (3), porque entra en solo lectura 3 días más tarde.
- Lo hace `runExpireTrials`, el mismo worker diario.
- No se manda mail en ese momento: el único template de bloqueo (`subscription_blocked`) habla de "14 días sin regularizar el pago" y de "90 días para reactivar", que no es este caso, y los templates no se tocan en esta ola. El aviso del panel muestra la fecha de corte desde el primer día de solo lectura.

### Mail al entrar en solo lectura (decidido, PENDIENTE de programar)

- Decisión de Lazar del 2026-10-22, posterior a #487: **sí** al mail al dueño cuando el complejo entra en solo lectura, con la fecha de corte (cuándo pasa a `blocked`).
- Hoy sale el mail de prueba vencida (`trial-expired`), que no tiene la fecha de corte.
- **No se programa todavía.** Va después de que RIVAL mergee su parte de templates: `src/modules/notifications/templates/index.ts` es superficie de RIVAL.

### Consecuencia sobre la mora (`past_due → suspended`)

- Reusar `suspended` hace que el que cae en `suspended` por cobro fallido también entre al panel en solo lectura, en lugar de ir a `/suspended`.
- Es lo que ya decía doc4 §2 ("Solo lectura admin"). ENS-20 lo había cerrado del todo porque, en ese momento, las Server Actions no rechazaban las escrituras. Hoy sí las rechazan (hallazgo R2).

## Efecto sobre El Vagón

La prueba vence el **2026-12-06** y el débito no está cargado.

**Sin `mp_subscription_id`:**

|                  | Hoy                          | Con este cambio                               |
| ---------------- | ---------------------------- | --------------------------------------------- |
| Ese día queda    | `blocked`                    | `suspended` (solo lectura)                    |
| Panel            | No entra (va a `/suspended`) | Ve sus datos y puede pagar; no opera          |
| Portal           | Se apaga                     | Se apaga (no cambia)                          |
| Pasa a `blocked` | —                            | 2026-12-20                                    |

**Con `mp_subscription_id`** (tocó "Activar" y el checkout quedó pendiente):

- Hoy: queda `blocked` el 2026-12-09.
- Con este cambio: queda `suspended` el 2026-12-09 y `blocked` el 2026-12-23.

**En los dos casos**, si paga en cualquier momento antes del bloqueo, vuelve a `active` con todo intacto.

## Alcance técnico

- Sin migración.
- No se tocan `billing.service.ts`, `dunning.service.ts`, `reconcile-subscriptions.worker.ts`, templates ni la superficie de RIVAL.
- Páginas: las del panel usaban el guard de las Server Actions como guard de página. Ahora lo piden con `allowReadOnly: true`. Las Server Actions no cambian: el default sigue siendo rechazar. Un test de clase (`app-page-guard-chain.test.ts`) marca toda página del panel que llame al guard sin `allowReadOnly`.

## Contradicciones de la doc que esto resuelve

`docs/spec/doc4_monetizacion.md`:

- §2 decía "día 31 → BLOCKED".
- §3 decía "conservados 60 días en modo solo lectura".

Quedan alineados con esta decisión.

## Follow-ups

- Ocultar o deshabilitar en la UI los controles de escritura durante el solo lectura (REQUIERE INPUT de Lazar). Hoy el aviso fijo lo explica y la acción devuelve un mensaje claro, pero el formulario se abre igual. En `/canchas`, "Pausar" muestra el mensaje de solo lectura bajo el título "No se pudo verificar el impacto", que se lee como un fallo técnico; se resuelve con lo mismo.
- La prueba vencida bloqueada nunca llega a `churned` ni a `deleted`: el barrido de churn necesita `dunning_started_at`. Es un hueco anterior a esta decisión (WARNING de doc7, auditado 2026-08-27), no lo abre este cambio, pero ahora pasa 14 días más tarde. Plazo de retención (Ley 25.326): REQUIERE INPUT de Lazar.
- **Mail al entrar en solo lectura, con la fecha de corte** (decidido, ver arriba). Se programa cuando RIVAL mergee sus templates.
- Template propio para "terminó el solo lectura, quedó bloqueado", cuando se destraben los templates.
