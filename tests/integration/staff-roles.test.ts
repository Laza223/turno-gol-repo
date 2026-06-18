import { afterAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'

// Migración 026 sumó 'manager'/'read_only'; la 029 quitó 'read_only'. El ENUM
// staff_role queda en 2 niveles: 'admin' (Administrador) y 'manager' (Encargado).
// El orden importa: 'admin' primero preserva el default de la columna.

afterAll(async () => {
  await closeSql()
})

describe('staff_role enum (migración 029)', () => {
  it('tiene exactamente admin y manager', async () => {
    const sql = getSql()
    const rows = await sql<{ value: string }[]>`
      SELECT unnest(enum_range(NULL::staff_role))::text AS value
    `
    expect(rows.map((r) => r.value)).toEqual(['admin', 'manager'])
  })

  it('mantiene admin como default de tenant_staff_members.role', async () => {
    const sql = getSql()
    const rows = await sql<{ column_default: string }[]>`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_name = 'tenant_staff_members' AND column_name = 'role'
    `
    expect(rows[0]?.column_default).toContain("'admin'")
  })
})
