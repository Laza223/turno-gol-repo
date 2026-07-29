import { sql } from 'drizzle-orm'
import type { DbTx } from '@/shared/db/client'

export type PlayerSearchResult = {
  id: string
  name: string
  email: string
}

/**
 * Autocomplete de jugadores para UI de staff (reserva manual, capitán de
 * equipo en Torneos). Acotado a jugadores con relación YA existente con ESTE
 * complejo (`player_tenant_relationships`) — mismo join tenant-scoped que
 * `listTenantPlayers` (jugadores/queries.ts), corre bajo `tx` normal (RLS),
 * no necesita el pool worker. Evitamos un directorio global de búsqueda de
 * personas: solo aparecen jugadores que ya jugaron en este complejo.
 */
export async function searchTenantPlayers(
  tenantId: string,
  query: string,
  tx: DbTx,
): Promise<PlayerSearchResult[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []
  const escaped = trimmed.replace(/[\\%_]/g, (m) => `\\${m}`)
  const like = `%${escaped}%`

  const rows = await tx.execute(sql`
    SELECT p.id, (p.first_name || ' ' || p.last_name) AS name, p.email
    FROM player_tenant_relationships r
    JOIN players p ON p.id = r.player_id
    WHERE r.tenant_id = ${tenantId}
      AND (
        (p.first_name || ' ' || p.last_name) ILIKE ${like}
        OR p.email ILIKE ${like}
      )
    ORDER BY name ASC
    LIMIT 8
  `)
  return rows as unknown as PlayerSearchResult[]
}
