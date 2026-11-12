# Freemium: decisiones de la spec y estado `free` (ADR)

**Fecha:** 2026-11-08 · **Decide:** Lazar, por select, sobre la spec del freemium. Baja a código la decisión de negocio [`2026-11-08-freemium.md`](2026-11-08-freemium.md), que manda sobre este documento. Revisó el ADR el agente `architecture-decision-reviewer`: **acompaña con condiciones** (C1 a C7, incorporadas abajo).

## Decisiones de la spec

1. **Tope:** 20 reservas online por mes (`FREE_ONLINE_BOOKINGS_PER_MONTH`).
2. **Aviso de cambio** de las condiciones del gratis: 30 días, por mail, igual que el aviso de cambio de términos.
3. **Pausa automática:** con 5 reservas online canceladas por el dueño en el mes, se pausan las reservas online del gratis hasta que el dueño confirme que marcó sus "ocupado" (`FREE_ONLINE_CANCEL_PAUSE_THRESHOLD`).
4. **Al bajar a gratis:**
   - caja, jugadores, fijos y métricas se ocultan y quedan guardados;
   - lo ya anotado en la grilla se ve como "ocupado", sin nombre ni precio;
   - los turnos fijos dejan de generar fechas, y las ya cargadas quedan como "ocupado".
5. **Baja voluntaria:** cuando vence lo pagado, el complejo baja a gratis. Para borrar todo, se pide por privacidad@ y se hace a mano.
6. **Sin verificación por ahora.** El gratis aparece en el buscador y en RIVAL con las mismas condiciones que la prueba: `marketplace_visible` y onboarding completo. Modifica la baranda "verificado para aparecer" de la decisión de negocio.
7. **Gratis abandonado:** 6 meses sin uso (sin entrar al panel y sin reservas nuevas) → mail de aviso y borrado a los 90 días, el mismo plazo que los términos dan para la baja. Entrar al panel cancela el borrado.
8. **Referidos:** el referidor gratis guarda el mes, y se le aplica cuando pasa al plan.

## ADR: el plan gratis es un estado nuevo `free` del lifecycle

**Problema.** El gratis necesita un estado de cuenta que hoy no existe: panel abierto con funciones recortadas, portal y buscador abiertos, sin cobro ni mora, sin vencimiento. Los estados actuales no sirven: `active` significa que paga, `suspended` es solo lectura y `blocked` está cerrado.

**Alternativas descartadas.**
1. **Una columna `tenants.plan`, con el gratis en `status='active'`.**
   - Era la inclinación de la decisión de negocio, pero en billing `active` significa "paga":
     - un cobro rechazado lo pasa a `past_due` (`dunning.service.ts`);
     - `transitionToActiveFromAny` no acepta `active` como origen;
     - `subscribe()` solo acepta `trialing` y `reactivate()` solo los estados caídos;
     - `CANCELABLE` incluye `active`;
     - el barrido de canchas facturadas filtra `active`.
   - Falla abierta: todo lo que lista `active` trataría al gratis como pago.
2. **Estado solo en `tenant_subscriptions`.** Es peor: `tenants.status` seguiría en `active`. Además esa tabla tiene RLS y no se lee cross-tenant desde el pool público, así que ni el buscador ni RIVAL podrían filtrar.
3. **Reusar `suspended`.** Es solo lectura y con el portal cerrado: lo contrario del gratis.
4. **Feature flags por complejo.** Son interruptores operativos, cacheados 60 s y con default `false`. El gratis es estado de facturación: transiciona en la máquina de estados y queda auditado.

**Decisión.** `free` es el noveno valor de `tenant_status` y de `subscription_status`, con sus propias transiciones en `lifecycle.service.ts`. Los guards no preguntan por el estado sino `isFreePlan(tenant)`, un único helper en `tenant.lifecycle.ts`.

```
trialing ──(vence sin pago; +3 días si tocó "Activar")──► free
active ─► past_due (7 d) ─► suspended (solo lectura hasta el día 14) ─► free
canceled ──(vence lo pagado)──► free
free ──(entra el pago)──► active
free ──(6 meses sin uso)──► aviso + borrado a los 90 días
```

**Reversibilidad.**
- El valor del enum queda para siempre, pero no molesta: existe `ALTER TYPE ... RENAME VALUE`.
- Pasar después a una columna de plan cuesta días, porque los guards ya consultan el helper y no el estado.
- **Un tercer plan reabre la discusión de la columna (C7).**
- Lo caro de revertir no es técnico: "gratis" queda publicado en `/precios` y en los términos.

**Consecuencias aceptadas.**
- **Listas de estados a mano.** Cada lista hardcodeada de estados se revisa a mano: el compilador no cubre las de `Set<string>` ni las de `IN (...)`.
  - Las listas de estados "buenos" dejan afuera al gratis por default, que es la falla segura.
  - Las de estados "malos" lo dejan pasar.
  - El wipe de retención pasa a lista blanca para no borrar un gratis por accidente (C6).
- **Cobro y mora (C1).** `free` se suma a las cadenas de estados del cobro aprobado (`onPaymentApproved`) y del reconciliador. Sin eso, un cobro tardío de un gratis no lo activaba.
- **Bot de WhatsApp (C2).** Se apaga en gratis, porque el bot reserva sin pasar por el tope.
- **Migraciones (C4).** Las dos migraciones (enum por un lado; columnas y funciones RIVAL por el otro) van en un PR propio, antes del código. El backfill de los complejos que hoy están en solo lectura o bloqueados por la prueba vencida lo hace el worker, sin mail, no la migración.
- **Pausa automática (C5).** Se evalúa en una transacción aparte, después de la cancelación, para no armar un ciclo de locks con el alta online.
- **Vencimiento (C7).** `free` no vence ni se borra por falta de pago. Lo limpia la regla de inactividad (decisión 7).
- **Código que se va.** Quedan muertos y se borran el solo lectura de la prueba vencida (`TRIAL_READ_ONLY_DAYS`, `trialReadOnlyEndsAt`, `blockEndedTrialReadOnly`) y su aviso.

## Lo que supera

- [`2026-10-22-solo-lectura-al-vencer-la-prueba.md`](2026-10-22-solo-lectura-al-vencer-la-prueba.md): la prueba vencida ya no pasa a solo lectura y después a `blocked`; baja a gratis. El solo lectura sigue existiendo para la mora, entre el día 7 y el 14.
- doc4 §2 a §4: el final de la mora y la baja voluntaria terminan en gratis, no en `blocked`.
