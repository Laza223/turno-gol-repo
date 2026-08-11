import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { abonados, bookings } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { significantPhoneSql } from './contact-identity'

/**
 * Vinculación manual de una persona sin cuenta con su jugador registrado (B13).
 *
 * La decisión de fase v2 §1 es explícita: **vinculación manual por el staff,
 * nunca merge automático**. El sistema puede SUGERIR (mismo teléfono) pero no
 * puede decidir: dos hermanos comparten el celular de la casa, y fusionar dos
 * personas por inferencia es irreversible en la cabeza del que mira la lista.
 * Por eso todo lo de acá abajo lo dispara un click, y todo tiene inverso.
 */

/** El grupo de contactos sin cuenta: teléfono normalizado, o `id:<uuid>`. */
const ROW_KEY_PREFIX = 'id:'

export type LinkContactResult = {
  abonadosLinked: number
  bookingsReassigned: number
}

export type UnlinkContactResult = {
  abonadosUnlinked: number
  bookingsReverted: number
}

/**
 * ¿El jugador ya es cliente de ESTE complejo? Vincular contra un `player_id`
 * arbitrario sería escribirle una relación a alguien de otro complejo, y encima
 * revelaría su nombre en la lista. La única fuente admisible de candidatos es
 * `player_tenant_relationships` de este tenant — la misma que alimenta la lista.
 */
async function playerBelongsToTenant(
  tenantId: string,
  playerId: string,
  tx: DbTx,
): Promise<boolean> {
  const rows = await tx.execute<{ ok: number }>(sql`
    SELECT 1 AS ok FROM player_tenant_relationships
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
    LIMIT 1
  `)
  return [...rows].length > 0
}

/**
 * Los abonados sin cuenta que forman el grupo, lockeados. `FOR UPDATE` antes de
 * escribir: dos vinculaciones concurrentes del mismo contacto se serializan, y
 * la segunda ve el `player_id` ya asignado y no encuentra nada que mover (el
 * filtro `player_id IS NULL` la vuelve idempotente en vez de doble-contar).
 */
async function lockContactAbonados(
  tenantId: string,
  contactKey: string,
  tx: DbTx,
): Promise<string[]> {
  const selector = contactKey.startsWith(ROW_KEY_PREFIX)
    ? sql`a.id = ${contactKey.slice(ROW_KEY_PREFIX.length)}::uuid`
    : sql`${sql.raw(significantPhoneSql('a.contact_phone'))} = ${contactKey}`

  const rows = await tx.execute<{ id: string }>(sql`
    SELECT a.id FROM abonados a
    WHERE a.tenant_id = ${tenantId}
      AND a.player_id IS NULL
      AND ${selector}
    FOR UPDATE
  `)
  return [...rows].map((r) => r.id)
}

/**
 * Suma al contador de la relación los turnos que la persona ya había jugado sin
 * cuenta. `bookings_count` en PTR es un contador incremental (lo sube
 * `ensurePTR` de a uno por reserva), no un `COUNT(*)`: por eso acá se suma la
 * cantidad real de reservas reasignadas en vez de recalcular.
 *
 * NO toca `noshow_count`: una ausencia vieja de cuando la persona no tenía
 * cuenta no debería disparar hoy un softban retroactivo. La ficha igual las
 * muestra, porque `getPlayerStats` cuenta sobre `bookings`.
 */
async function shiftRelationshipCounters(
  tenantId: string,
  playerId: string,
  delta: number,
  lastBookingAt: Date | null,
  tx: DbTx,
): Promise<void> {
  if (delta === 0) return
  await tx.execute(sql`
    UPDATE player_tenant_relationships
    SET bookings_count = GREATEST(bookings_count + ${delta}, 0),
        last_booking_at = ${
          lastBookingAt
            ? sql`GREATEST(last_booking_at, ${lastBookingAt.toISOString()}::timestamptz)`
            : sql`last_booking_at`
        }
    WHERE tenant_id = ${tenantId} AND player_id = ${playerId}
  `)
}

function maxStartsAt(rows: Array<{ startsAt: Date | null }>): Date | null {
  let max: Date | null = null
  for (const r of rows) {
    if (r.startsAt && (!max || r.startsAt > max)) max = r.startsAt
  }
  return max
}

/**
 * Vincula todos los turnos fijos de un contacto sin cuenta con un jugador
 * registrado del complejo, y le reasigna las reservas que esos fijos generaron
 * (pasadas y futuras) para que su ficha e historial dejen de estar partidos.
 *
 * Devuelve `null` si el jugador no es cliente de este complejo. Devuelve
 * `{ abonadosLinked: 0 }` si el contacto ya no tiene fijos sin vincular — no es
 * un error, es la segunda vez que alguien apretó el botón.
 */
export async function linkContactToPlayer(
  tenantId: string,
  contactKey: string,
  playerId: string,
  tx: DbTx,
): Promise<LinkContactResult | null> {
  if (!(await playerBelongsToTenant(tenantId, playerId, tx))) return null

  const abonadoIds = await lockContactAbonados(tenantId, contactKey, tx)
  if (abonadoIds.length === 0) return { abonadosLinked: 0, bookingsReassigned: 0 }

  await tx
    .update(abonados)
    .set({ playerId, updatedAt: new Date() })
    .where(and(eq(abonados.tenantId, tenantId), inArray(abonados.id, abonadoIds)))

  // Solo las reservas que todavía no tienen dueño: si una la generó otro camino
  // y ya apunta a alguien, no se la robamos.
  const moved = await tx
    .update(bookings)
    .set({ playerId })
    .where(
      and(
        eq(bookings.tenantId, tenantId),
        inArray(bookings.abonadoId, abonadoIds),
        isNull(bookings.playerId),
      ),
    )
    .returning({ id: bookings.id, startsAt: bookings.startsAt })

  await shiftRelationshipCounters(tenantId, playerId, moved.length, maxStartsAt(moved), tx)

  return { abonadosLinked: abonadoIds.length, bookingsReassigned: moved.length }
}

/**
 * Inverso exacto de `linkContactToPlayer`: devuelve los fijos del jugador al
 * estado "sin cuenta" y despega sus reservas. Existe porque una vinculación
 * manual sin deshacer es una trampa — el nombre y el teléfono siguen en
 * `abonados`, así que la persona no se pierde, vuelve a la lista como contacto.
 *
 * Alcanza a TODOS los fijos del jugador en este complejo, incluidos los que se
 * crearon ya vinculados desde el formulario. Es la lectura correcta del botón:
 * "esta persona no es la titular de estos fijos".
 */
export async function unlinkContactFromPlayer(
  tenantId: string,
  playerId: string,
  tx: DbTx,
): Promise<UnlinkContactResult> {
  const locked = await tx.execute<{ id: string }>(sql`
    SELECT a.id FROM abonados a
    WHERE a.tenant_id = ${tenantId} AND a.player_id = ${playerId}
    FOR UPDATE
  `)
  const abonadoIds = [...locked].map((r) => r.id)
  if (abonadoIds.length === 0) return { abonadosUnlinked: 0, bookingsReverted: 0 }

  await tx
    .update(abonados)
    .set({ playerId: null, updatedAt: new Date() })
    .where(and(eq(abonados.tenantId, tenantId), inArray(abonados.id, abonadoIds)))

  const reverted = await tx
    .update(bookings)
    .set({ playerId: null })
    .where(
      and(
        eq(bookings.tenantId, tenantId),
        inArray(bookings.abonadoId, abonadoIds),
        eq(bookings.playerId, playerId),
      ),
    )
    .returning({ id: bookings.id })

  await shiftRelationshipCounters(tenantId, playerId, -reverted.length, null, tx)

  return { abonadosUnlinked: abonadoIds.length, bookingsReverted: reverted.length }
}
