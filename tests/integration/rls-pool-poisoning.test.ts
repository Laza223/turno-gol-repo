import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql as drizzleSql } from 'drizzle-orm'
import type { ReservedSql } from 'postgres'
import {
  closeSql,
  getSql,
  withContext,
  withTenantContext,
} from '@/shared/db/client'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'
import { seedIsolationData, type IsolationSeed } from '../helpers/seed'

let tenantA: { id: string }
let tenantB: { id: string }
let seedA: IsolationSeed
let seedB: IsolationSeed

// El test de pool poisoning solo tiene valor si la transacción de "limpieza"
// puede reutilizar la MISMA conexión física que dejó contexto de tenant. Con
// sql.reserve() fijamos una conexión; pero el test paralelo necesita >=2 libres.
// Espejo de resolvePoolMax() en src/shared/db/client.ts.
const EFFECTIVE_POOL_MAX = (() => {
  const raw = process.env.DATABASE_POOL_MAX
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : 3
})()

beforeAll(async () => {
  const s = getSql()
  await ensureRoles(s)
  await cleanupAll(s)
  tenantA = await createTestTenant(s)
  tenantB = await createTestTenant(s)
  seedA = await seedIsolationData(s, tenantA.id)
  seedB = await seedIsolationData(s, tenantB.id)
}, 30_000)

afterAll(async () => closeSql())

// ─── helpers ────────────────────────────────────────────────────────
// Ejecuta una transacción explícita SOBRE una conexión reservada concreta.
// Garantiza que SET LOCAL viva exactamente dentro de ese BEGIN/COMMIT y que
// dos invocaciones consecutivas usen el MISMO backend (clave del test de
// poisoning: el pool por defecto entregaría conexiones distintas y el leak
// pasaría inadvertido).
async function txOn<T>(
  conn: ReservedSql,
  fn: (tx: ReservedSql) => Promise<T>,
): Promise<T> {
  await conn`BEGIN`
  try {
    const result = await fn(conn)
    await conn`COMMIT`
    return result
  } catch (e) {
    await conn`ROLLBACK`.catch(() => {})
    throw e
  }
}

async function courtIdsAsApp(
  conn: ReservedSql,
  tenantId?: string,
): Promise<string[]> {
  return txOn(conn, async (tx) => {
    await tx`SET LOCAL ROLE turnogol_app`
    if (tenantId) {
      await tx`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`
    }
    const rows = await tx<{ id: string }[]>`SELECT id FROM courts`
    return rows.map((r) => r.id)
  })
}

describe('RLS pool poisoning: SET LOCAL es transaction-scoped', () => {
  // Reescrito (antes 🔴): la versión anterior corría withTenantContext como
  // superusuario postgres (bypassa RLS → la aserción length>0 era vacua) y la
  // tx de "limpieza" tomaba una conexión arbitraria del pool, por lo que un
  // leak session-scoped real podía esconderse en otra conexión. Acá fijamos el
  // pool a 1 conexión libre para forzar la reutilización y ejercitar el wrapper
  // de producción `withTenantContext`.
  it('withTenantContext(A) no filtra el tenant a una tx posterior en la misma conexión', async () => {
    const s = getSql()
    // Drenamos el pool dejando exactamente 1 conexión libre: tanto el wrapper
    // (drizzle) como la tx de verificación (postgres-js) comparten ese pool, así
    // que ambos deben usar ESA conexión. Si el wrapper usara set_config(...,false)
    // en lugar de true, el GUC sobreviviría al COMMIT y el SELECT siguiente vería
    // a A → leaked.length > 0.
    const drained: ReservedSql[] = []
    for (let i = 0; i < EFFECTIVE_POOL_MAX - 1; i++) {
      drained.push(await s.reserve())
    }
    try {
      // Wrapper de producción. Corre como superusuario (bypassa RLS), por eso
      // acá NO probamos RLS sino el residuo del GUC tras cerrar la tx.
      await withTenantContext(tenantA.id, async (tx) => {
        const rows = await tx.execute(drizzleSql`
          SELECT id FROM courts WHERE id = ${seedA.courtId} LIMIT 1
        `)
        expect((rows as unknown as unknown[]).length).toBeGreaterThan(0)
      })

      // Misma conexión, rol turnogol_app (no superusuario → RLS activa), SIN
      // setear tenant. Si el contexto de A persistió, este SELECT lo delataría.
      const leaked = await withContext({ role: 'turnogol_app' }, async (tx) => {
        const rows = await tx<{ id: string }[]>`SELECT id FROM courts`
        return rows
      })
      expect(leaked.map((r) => r.id)).not.toContain(seedA.courtId)
      expect(leaked.length).toBe(0)
    } finally {
      for (const r of drained) r.release()
    }
  }, 30_000)

  it('SET LOCAL app.current_tenant_id se resetea entre tx en la MISMA conexión reservada', async () => {
    const s = getSql()
    const conn = await s.reserve()
    try {
      // tx1: con contexto de A → control positivo (RLS deja ver SOLO la cancha de A).
      const withCtx = await courtIdsAsApp(conn, tenantA.id)
      expect(withCtx).toContain(seedA.courtId)
      expect(withCtx).not.toContain(seedB.courtId)

      // tx2: MISMA conexión, sin contexto → RLS filtra todo (el GUC no sobrevivió).
      const noCtx = await courtIdsAsApp(conn)
      expect(noCtx.length).toBe(0)
    } finally {
      await conn`RESET ALL`.catch(() => {})
      conn.release()
    }
  }, 30_000)

  // Control positivo (canary): demuestra que el harness SÍ puede detectar un
  // leak. Si este test devolviera 0 filas, los `toBe(0)` de arriba serían
  // falso-verde (tabla vacía / GRANT revocado / RLS apagada los volverían
  // triviales). Acá inyectamos a propósito un GUC session-scoped (is_local=false)
  // y verificamos que SÍ se filtra a la siguiente tx de la misma conexión.
  it('CANARY: un GUC session-scoped (set_config local=false) SÍ se filtra entre tx → el detector tiene dientes', async () => {
    const s = getSql()
    const conn = await s.reserve()
    try {
      // tx1: set_config(..., false) = SET de sesión, sobrevive al COMMIT.
      const seen = await txOn(conn, async (tx) => {
        await tx`SET LOCAL ROLE turnogol_app`
        await tx`SELECT set_config('app.current_tenant_id', ${tenantA.id}, false)`
        const rows = await tx<{ id: string }[]>`SELECT id FROM courts`
        return rows.map((r) => r.id)
      })
      expect(seen).toContain(seedA.courtId)

      // tx2: MISMA conexión, sin volver a setear contexto. El GUC de sesión
      // persiste → la cancha de A se filtra. Esto prueba que un SELECT que
      // devuelve 0 en los tests de arriba es señal real de aislamiento.
      const leaked = await txOn(conn, async (tx) => {
        await tx`SET LOCAL ROLE turnogol_app`
        const rows = await tx<{ id: string }[]>`SELECT id FROM courts`
        return rows.map((r) => r.id)
      })
      expect(leaked).toContain(seedA.courtId)
    } finally {
      // CRÍTICO: en singleThread todos los archivos de integración comparten el
      // pool. Sin RESET ALL esta conexión volvería envenenada y rompería otros
      // tests al reciclarse.
      await conn`RESET ALL`.catch(() => {})
      conn.release()
    }
  }, 30_000)

  it('secuencial A→B en la misma conexión: B no ve datos de A (sin residuo del tenant previo)', async () => {
    const s = getSql()
    const conn = await s.reserve()
    try {
      const aRows = await courtIdsAsApp(conn, tenantA.id)
      expect(aRows).toContain(seedA.courtId)
      expect(aRows).not.toContain(seedB.courtId)

      // Misma conexión, ahora contexto de B. Si el tenant_id de A hubiese
      // quedado pegado, B vería la cancha de A.
      const bRows = await courtIdsAsApp(conn, tenantB.id)
      expect(bRows).toContain(seedB.courtId)
      expect(bRows).not.toContain(seedA.courtId)
    } finally {
      await conn`RESET ALL`.catch(() => {})
      conn.release()
    }
  }, 30_000)

  it('paralelo en conexiones reservadas distintas: A + B simultáneos no se cruzan', async () => {
    if (EFFECTIVE_POOL_MAX < 2) {
      throw new Error(
        `Este test requiere DATABASE_POOL_MAX>=2 para reservar 2 conexiones ` +
          `simultáneas y ejercitar el aislamiento concurrente. ` +
          `Pool efectivo actual: ${EFFECTIVE_POOL_MAX}.`,
      )
    }
    const s = getSql()
    const connA = await s.reserve()
    const connB = await s.reserve()
    try {
      // Las dos tx corren a la vez sobre backends DISTINTOS, cada uno con su GUC.
      const [aRows, bRows] = await Promise.all([
        courtIdsAsApp(connA, tenantA.id),
        courtIdsAsApp(connB, tenantB.id),
      ])
      expect(aRows).toContain(seedA.courtId)
      expect(aRows).not.toContain(seedB.courtId)
      expect(bRows).toContain(seedB.courtId)
      expect(bRows).not.toContain(seedA.courtId)
    } finally {
      connA.release()
      connB.release()
    }
  }, 30_000)

  // Gap nuevo: SET LOCAL ROLE también es transaction-scoped. Si una ruta usara
  // `SET ROLE` (sin LOCAL), la conexión quedaría pegada como turnogol_app y los
  // background jobs (que esperan correr como superusuario/service role) caerían
  // bajo RLS silenciosamente (ver BK-01). Verificamos que la tx siguiente vuelve
  // a postgres y bypassa RLS.
  it('SET LOCAL ROLE turnogol_app no se pega: la tx siguiente vuelve a superusuario y bypassa RLS', async () => {
    const s = getSql()
    const conn = await s.reserve()
    try {
      const asApp = await txOn(conn, async (tx) => {
        await tx`SET LOCAL ROLE turnogol_app`
        const [{ current_user: who }] =
          await tx<{ current_user: string }[]>`SELECT current_user`
        return who
      })
      expect(asApp).toBe('turnogol_app')

      // Misma conexión, sin SET ROLE: debe haber vuelto al rol base (superusuario).
      const after = await txOn(conn, async (tx) => {
        const [{ current_user: who }] =
          await tx<{ current_user: string }[]>`SELECT current_user`
        // Superusuario bypassa RLS → ve canchas de AMBOS tenants sin contexto.
        const rows = await tx<{ id: string }[]>`SELECT id FROM courts`
        return { who, ids: rows.map((r) => r.id) }
      })
      expect(after.who).not.toBe('turnogol_app')
      expect(after.ids).toContain(seedA.courtId)
      expect(after.ids).toContain(seedB.courtId)
    } finally {
      await conn`RESET ALL`.catch(() => {})
      conn.release()
    }
  }, 30_000)

  // Gap nuevo: el contexto de jugador (app.current_player_id) es cross-tenant y
  // más peligroso si se filtra. Verificamos que también es transaction-scoped.
  it('SET LOCAL app.current_player_id no filtra el jugador a una tx posterior', async () => {
    const s = getSql()
    const conn = await s.reserve()
    try {
      // tx1: contexto del jugador de A. Vía policy player_read_court ve la cancha
      // donde tiene reserva (seedA.courtId), sin app.current_tenant_id.
      const withPlayer = await txOn(conn, async (tx) => {
        await tx`SET LOCAL ROLE turnogol_app`
        await tx`SELECT set_config('app.current_player_id', ${seedA.playerId}, true)`
        const rows = await tx<{ id: string }[]>`SELECT id FROM courts`
        return rows.map((r) => r.id)
      })
      expect(withPlayer).toContain(seedA.courtId)

      // tx2: misma conexión, sin contexto de jugador → 0 filas.
      const noPlayer = await txOn(conn, async (tx) => {
        await tx`SET LOCAL ROLE turnogol_app`
        const rows = await tx<{ id: string }[]>`SELECT id FROM courts`
        return rows.map((r) => r.id)
      })
      expect(noPlayer.length).toBe(0)
    } finally {
      await conn`RESET ALL`.catch(() => {})
      conn.release()
    }
  }, 30_000)
})
