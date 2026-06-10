# Decisiones Pendientes — Fase 3 (lote HIGH #9–23)

Hallazgos del lote que requieren una decisión arquitectónica / de producto antes
de poder implementarse. Documentados según la metodología (saltar + documentar,
no inventar el modelo).

## #23 — Bloqueo por saldo deudor en reserva online (`🟡 HIGH`)

**Archivo objetivo (triage):** `src/modules/bans/ban.service.ts` / `src/modules/bookings/booking.service.ts`

**Hallazgo:** el bloqueo por saldo deudor (`player_tenant_relationships.balance > 0`
= jugador bloqueado para reservar online en ese complejo) no está implementado;
`createOnlineBooking` sólo verifica bans vía `checkPlayerBanned`.

**Por qué se difiere (decisión arquitectónica / de esquema):**

- La columna `player_tenant_relationships.balance` **no existe** en el schema
  Drizzle (`src/shared/db/schema/player-tenant-relationships.ts`) ni en las
  migraciones. La tabla sólo tiene `status text CHECK IN ('active','blocked')`,
  `bookings_count` y `noshow_count`. Esto es exactamente el **BLOCKER #2**, que
  sigue vigente en `HEAD` (verificado por grep: `balance` no aparece en el
  schema de PTR ni en `modules/bookings`/`modules/bans`).
- Implementar el finding tal como está escrito (`balance > 0`) exige **agregar
  una columna nueva + migración SQL + espejo en `supabase/migrations` + revisar
  la RLS dual** de la tabla (policies admin/jugador). Es un cambio de esquema,
  no un fix puntual de UI/lógica.
- Hay además una decisión de modelado abierta: ¿deuda como entero de centavos
  (`balance`) como dice CLAUDE.md, o reutilizar el `status='blocked'` per-tenant
  que ya existe en la tabla? Difieren en cómo se setea/limpia la deuda (no hay
  billetera virtual; reembolsos/no-shows se resuelven entre jugador y complejo).

**Recomendación:** resolver primero BLOCKER #2 (definir y migrar el modelo de
deuda) y recién después agregar el chequeo en `createOnlineBooking`, junto al
`checkPlayerBanned` existente. **Quedó sin tocar en este lote** (no se marca ✅).

---

## #72 — /mis-reservas: ¿mostrar historial a jugador baneado? (`🟢 LOW`)

**Archivo objetivo:** `src/app/(player)/mis-reservas/page.tsx`

**Hallazgo:** la vista no filtra por `player_status ('banned'/'anonymized')` ni por
`tenant_player_bans`. Un jugador baneado ve su historial de reservas normalmente.

**Por qué se difiere (decisión de producto):**

El propio triage lo marca como "puede ser intencional". El aislamiento RLS
(`player_own_bookings_select`) garantiza que un jugador sólo ve sus propias
reservas; no hay fuga de datos entre jugadores. La pregunta es de UX/negocio:
¿un jugador baneado debería seguir accediendo a su historial o se le debe
bloquear el acceso?

**Recomendación:** decidir explícitamente la política:
- Opción A (status quo): el baneado puede ver su historial → no hay cambio de código.
- Opción B: mostrar banner de cuenta bloqueada en `/mis-reservas` y ocultar las reservas de ese complejo (requiere pasar `tenantId` al componente, lo cual actualmente no está modelado en el player context).

**Quedó sin tocar en este lote** (decisión de producto pendiente, no se marca ✅).

---

## #74 — bookingStatus failMode='open' (`🟢 LOW`)

**Archivo objetivo:** `src/shared/rate-limit/policies.ts`

**Hallazgo:** la policy `bookingStatus` usa `failMode='open'`, lo que significa que
si Upstash/Redis cae, el endpoint de polling queda sin rate limit.

**Por qué se difiere (tradeoff de disponibilidad explícito):**

El propio triage lo marca como "tradeoff aceptable para un endpoint de solo lectura".
Cambiar a `failMode='closed'` bloquearía el polling de estado de pago para TODOS los
jugadores durante cualquier outage de Redis, dejando la pantalla "Confirmando tu pago"
congelada sin que el usuario pueda saber si su reserva se procesó. El impacto de un
outage de rate-limit en un endpoint read-only (solo consulta estado, no muta) es mucho
menor que el impacto de bloquearlo completamente.

**Recomendación:** dejar `failMode='open'` en producción. Si en el futuro se agrega
autenticación de jugador al endpoint (actualmente el token de jugador ya existe en la
sesión), se puede limitar además por `playerId` para contener el blast radius.

**Quedó sin tocar en este lote** (tradeoff de disponibilidad aceptado, no se marca ✅).
