import { afterAll, describe, expect, it } from 'vitest'
import { closeSql, getSql } from '@/shared/db/client'

// Migración 026: el ENUM staff_role pasa de solo 'admin' a 3 niveles fijos.
// 'admin' (Administrador), 'manager' (Encargado), 'read_only' (Solo lectura).
// El orden importa: 'admin' primero preserva el default de la columna.

afterAll(async () => {
  await closeSql()
})

describe('staff_role enum (migración 026)', () => {
  it('tiene exactamente admin, manager y read_only', async () => {
    const sql = getSql()
    const rows = await sql<{ value: string }[]>`
      SELECT unnest(enum_range(NULL::staff_role))::text AS value
    `
    expect(rows.map((r) => r.value)).toEqual(['admin', 'manager', 'read_only'])
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
