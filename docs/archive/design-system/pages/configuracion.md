# Configuración — spec de vista (page doc)

> Override de `design-system/MASTER.md` v2.2 para `/settings/*`. Lo que este doc define, manda acá;
> para todo lo demás rige el MASTER. Hermana de `pages/grilla.md` (v2.0, el precedente de cómo se
> baja un handoff de Design a este repo) y de `pages/horarios-precios.md`/`pages/staff.md` (siguen
> vigentes para el detalle interno de esas dos pestañas — este doc solo cubre lo que cambió: el
> armazón compartido y la anatomía de Perfil/Reservas/Facturación).

**Versión:** 1.0 — 2026-09-11 (rediseño completo a partir de la propuesta de Claude Design —
`docs/planning/prompts-claude-design/implementacion-2-configuracion.md` — y migración al armazón
de riel/`AdminHeaderSlot` que introdujo `pages/grilla.md` v2.0)
**Código:** `src/app/(admin)/settings/{layout,SettingsTabs}.tsx` · `perfil/` · `reservas/` ·
`horarios/` · `equipo/` · `facturacion/`
**Personalidad:** Admin ("El Mostrador") — dueño únicamente; el encargado ve el candado en "Ajustes"
del riel y nunca entra (§4).

---

## 1. Anatomía — la vista no tiene encabezado propio

Igual regla que Grilla (`pages/grilla.md` §1): **Configuración no abre ni una fila sobre el
contenido.** Las 5 pestañas (`SettingsTabs.tsx`) están portaladas a `AdminHeaderSlot` — la barra
superior de 60px del panel — igual que `GrillaTabs.tsx`. Antes cada una de las 5 páginas abría su
propio `PageHeader` (banda + `<h1>` + subtítulo) DEBAJO de esa misma barra, repitiendo el nombre de
la sección que la pestaña activa ya dice. Eso se sacó.

```
╔═ Barra superior del panel (60px, fija) ═════════════════════════════════════╗
║ COMPLEJO │ [Perfil|Reservas|Horarios|Equipo|Facturación]                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
┌─ Contenido de la pestaña activa, sin título propio ─────────────────────────┐
│  card-premium · card-premium · …                                            │
```

- `SettingsTabs` acepta un prop `actions?: ReactNode` para colgar, a la derecha de las pestañas en
  el mismo hueco, la acción de la vista activa (hoy solo Equipo: "Agregar miembro del equipo" —
  antes vivía en el `actions` del `PageHeader` que esa pestaña también tenía y ya no tiene).
- El diseño de Claude Design traía un `PageHeader` (ícono + `<h1>` + subtítulo) dentro de cada
  pantalla — se descartó a propósito: el propio armazón (§6.8 del MASTER) ya lo prohíbe, y Claude
  Design generó el mockup mirando el estado de Configuración ANTERIOR al rediseño de Grilla, sin
  conocer el patrón nuevo. Donde el diseño trae contexto útil que no es un título repetido (un
  subtítulo explicativo real), se conservó como texto normal dentro de la primera card, no como
  banda de encabezado.
- El ítem del riel dice "Ajustes" (60px); el nombre accesible completo ("Configuración") no cambia.

## 2. Perfil (`settings/perfil/`)

- **Maqueta de la cabecera pública** primero en la card "Perfil público": muestra cómo se ve
  portada + logo + nombre + dirección en `/${tenant.slug}` con los datos reales del tenant, para no
  tener que abrir el perfil público en otra pestaña a ciegas después de subir una imagen.
- **Portada y logo**: dos filas (no dos cajas grandes de "tamaño recomendado"), cada una con nombre
  + una línea de ayuda + estado + el `ImageUploader` de siempre. **Sigue guardando al subir**, sin
  botón "Guardar" propio — comportamiento intacto, solo el contenedor cambió.
- **"Datos del complejo"**: fusiona Contacto (teléfono/WhatsApp/email) + Ubicación
  (dirección/localidad/provincia/mapa) en un solo `TenantProfileForm` con un solo "Guardar cambios"
  (`updateTenantProfileAction`, valida los dos schemas existentes — `tenantContactSchema` +
  `tenantLocationSchema` — y escribe con un único `updateTenant`, todo o nada). Los componentes
  viejos (`TenantContactForm.tsx`/`TenantLocationForm.tsx`) siguen en el repo con sus propios tests
  y stories, pero ningún flujo de producción los usa más — no reponerlos como "la forma de editar
  contacto/ubicación", `TenantProfileForm` es la única puerta de entrada real.
- El mapa (`LocationPickerField`, prop `collapsible`) se pliega solo cuando ya hay un punto marcado
  — si falta, arranca expandido (mismo criterio que "no esconder configuración que falta cargar").
- Al final, plegadas (`Collapsible` real de `ui/`, nunca `<details>`): "Resumen diario por email" y
  "Correo con el que entrás" — cada una con su valor actual como resumen en el trigger.

## 3. Reservas (`settings/reservas/`)

- Orden: Reservas por internet → Seña → Anticipación para reservar → Anticipación para cancelar.
  Cada campo lleva su frase de consecuencia con datos REALES interpolados (fecha límite calculada
  con `bookingAdvanceDays` vía `artTodayStr`/`addDays`, nunca `new Date().toISOString()`).
- Panel "Así lo ve el jugador" (sticky en desktop): ejemplo de seña con el precio más COMÚN entre
  las canchas del tenant — ponderado por horas-turno reales de cobertura (`ruleHours` en
  `page.tsx`, vía `effectiveCloseMins`/`hhmmToMins` de `operating-day.ts`), no por cantidad de
  franjas JSONB. Nunca se persiste: es solo ilustrativo.
- "Ausencias (no-show)" pasa a `Collapsible` cerrado por default ("¿Y si el jugador falta?"). El
  texto informativo no cambió (90 días / 14 días, `src/shared/constants.ts`).

## 4. Horarios (`settings/horarios/`)

Ver `pages/horarios-precios.md` para el modelo general+excepciones. Cambio de este rediseño:

- **El checkbox manual "Cierra después de medianoche" se ELIMINÓ**, tanto acá como en el wizard de
  onboarding (`StepSchedule.tsx`). `closesNextDay` se DERIVA siempre en `horariosFormDataToInput`
  (`opening-hours.schema.ts`): `true` si algún día abierto tiene `close ≤ open`. Reproduce
  exactamente el mismo comportamiento que la validación ya exigía manualmente — de 6 pasos a 3 en
  el caso típico (abrir hasta la madrugada).
  - Limitación preexistente conocida, NO introducida por este cambio: un horario que cruce DOS
    medianoches (apertura de ~24h corridas) no es representable en el modelo actual — tampoco lo
    era con el checkbox manual.
- El aviso "Cerrás pasada la medianoche…" es ahora automático (no hay nada que "activar").
- Los 7 días viven en un `Collapsible` con resumen dinámico en el trigger ("Sábado 15:00–02:00 ·
  Domingo cerrado"), arranca abierto solo si hay excepciones reales.
- "Días cerrados" bajó de card completa a una fila compacta con chips + "Agregar fecha".

## 5. Equipo (`settings/equipo/`)

Ver `pages/staff.md` para tabla/badges/empty-state. Cambios de este rediseño:

- El `PageHeader` que vivía DENTRO de `StaffRosterView.tsx` se sacó (era la única pestaña que
  todavía no había migrado al patrón §1). Su CTA ("Agregar miembro del equipo") pasa al prop
  `actions` de `SettingsTabs`.
- Nueva card "Qué ve cada persona", ANTES de la lista: 2 sub-cards (Administrador/Encargado) con
  badge + tagline + grid de espacios (check/lock). Fuente: `STAFF_ROLE_SPACES` en
  `src/modules/staff/roles.ts` (mantenida a mano, sincronizada con `NAV_ITEMS` de
  `admin-sidebar.tsx` por comentario cruzado — no hay un import directo porque el sidebar es
  `'use client'` y `roles.ts` es server-safe).
  - **"Torneos" se omite del todo** (ni check ni lock, para los dos roles) si el feature flag
    global (`TOURNAMENTS_FLAG`) está apagado para el tenant — decisión del dueño.
- "Reenviar invitación" ahora tiene un botón visible en la fila `pending`, además del ítem que ya
  existía en el menú "…" (no se sacó de ahí, por si algún test/flujo lo esperaba ahí también).
- Email junto al nombre en la misma celda (antes, columna separada).

## 6. Facturación (`settings/facturacion/`)

- "En 3 segundos": 2 cards arriba — "Tu plan" (nombre, "hasta N canchas · usás M" con
  `courts.length`, próximo cobro) y "MercadoPago para cobrar señas" (nickname + el aviso de 18 días
  de acreditación con el link al video, YA EXISTENTE, movido tal cual — no se reescribió ese copy).
- Todo lo demás plegado (`BillingDisclosure`, wrapper local sobre `Collapsible`): Pagos del plan,
  Cambiar de plan, Cuenta con la que pagás TurnoGol, Dar de baja (junta Cancelar suscripción +
  Desconectar MP bajo el mismo disclosure, mismas confirmaciones que antes).
- El disclosure `id="cuenta-mp"` se auto-abre si `window.location.hash === '#cuenta-mp'`
  (`HashOpenCollapsible.tsx`) — necesario porque `ActivatePlanSection`/`ChangePlanSection` linkean
  ahí cuando el email de MP está en conflicto, y antes de este componente aterrizaban en un
  acordeón cerrado.
- Precios reales sin cambios ($63.000 / $99.000 / $129.000 — `plans-data.ts`); las 3 cards de plan
  quedaron como estaban (no se reempaquetaron a filas compactas: el riesgo de tocar la lógica de
  selección de canchas/ciclo superaba el beneficio de layout).

## 7. Sin acceso (encargado)

Sin cambios de comportamiento: `settings/layout.tsx` (`requireAdminStaff`) sigue redirigiendo a
`/grilla?notice=settings-admin-only`, traducido a un toast por `SettingsAccessNotice.tsx`. El
candado que pedía la propuesta de diseño ya existe, permanente, en el ítem "Ajustes" del riel
(`admin-sidebar.tsx`) — no se agregó un ícono redundante al toast efímero.

## 8. Reglas heredadas de `pages/grilla.md` (v2.0, §1/§4)

- La vista no abre encabezado propio (§1 acá arriba).
- Medidas por CSS, superficies por hook: los `Collapsible` usan `forceMount` + `data-[state=closed]:hidden`
  (nunca desmontan inputs con `name=`), salvo el caso documentado del mapa de Leaflet
  (`LocationPickerField`, que SÍ desmonta a propósito — un mapa en un contenedor `display:none` se
  rompe sin `invalidateSize`).
- Cobrar/pagar en pocos toques, acciones secundarias plegadas tras un disclosure — aplicado en
  Facturación (Dar de baja) y Reservas (Ausencias).

## 9. Deuda declarada / fuera de scope (no ejecutar sin pedido)

- H163 (guard de Canchas inconsistente: `requireOperatorStaff()` en `settings/canchas/page.tsx`
  nunca corre porque `settings/layout.tsx` ya redirigió antes) — conocida, deliberadamente no
  tocada por este rediseño.
- `TenantContactForm.tsx`/`TenantLocationForm.tsx` quedaron sin consumidor de producción, con sus
  tests/stories propios intactos — no se borraron para no arrastrar ese refactor a este esfuerzo.
- Reempaquetar `ActivatePlanSection`/`ChangePlanSection` a filas compactas (propuesta de diseño,
  no ejecutado — ver §6).
