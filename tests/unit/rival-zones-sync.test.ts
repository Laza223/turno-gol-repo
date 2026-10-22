import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RIVAL_ZONES } from '@/modules/rival/rival-zones'

/** La lista cerrada vive en dos lados (CHECK de la migración 099 y rival-zones.ts): no se pueden desincronizar. */
describe('players_zone_check (migr. 099) vs RIVAL_ZONES', () => {
  for (const file of [
    'src/shared/db/migrations/099_rival_v1.sql',
    'supabase/migrations/20260424000099_rival_v1.sql',
  ]) {
    it(`${file} tiene exactamente las zonas de rival-zones.ts`, () => {
      const sql = readFileSync(join(process.cwd(), file), 'utf8')
      const m = /CONSTRAINT players_zone_check CHECK \(zone IN \(([^)]*)\)\)/.exec(sql)
      expect(m, 'no se encontró players_zone_check en la migración').not.toBeNull()
      const zones = [...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1])
      expect(zones).toEqual([...RIVAL_ZONES])
    })
  }
})
