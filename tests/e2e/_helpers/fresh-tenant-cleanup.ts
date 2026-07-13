import type postgres from 'postgres'

type SqlClient = ReturnType<typeof postgres>

/**
 * DSN de superusuario. Igual que en `scripts/seed-e2e.ts`: el rol de la app
 * (`turnogol_app`) está restringido a propósito (migr. 037-039) y no puede hacer este
 * barrido. CI y el Supabase local comparten estas credenciales; el código de producción
 * nunca toma este camino.
 */
export const SEED_ADMIN_URL = 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

/**
 * Borra todos los tenants que el "fresh admin" haya creado, con el orden de FK inverso.
 *
 * POR QUÉ EXISTE COMO HELPER COMPARTIDO Y NO COMO BLOQUE INLINE EN EL SEED:
 *
 * El fresh admin (`e2e-admin-fresh@turnogol.test`) es una fixture cuyo valor entero es
 * NO tener onboarding completo — `onboarding.spec.ts` lo usa justamente para eso.
 * Pero cualquier spec que maneje el wizard hasta el final le CONSUME esa propiedad: le
 * deja un tenant creado y el onboarding cerrado. A partir de ahí `/onboarding` redirige
 * a `/dashboard` y los tests de onboarding fallan, sin que nadie haya tocado el wizard.
 *
 * `seed-e2e.ts` ya limpiaba esto, pero corre UNA SOLA VEZ en el global setup: no protege
 * de una contaminación que pasa DURANTE la corrida. Eso es exactamente lo que hacía
 * `capture-screenshots.spec.ts` (crea "Complejo UX Audit" para sacarle fotos al wizard):
 * un solo spec dejaba 5 tests ajenos en rojo.
 *
 * Cualquier spec que complete el onboarding del fresh admin tiene que llamar a esto en su
 * `afterAll`. Vive acá, y no duplicado, para que el orden de FK no se desincronice cuando
 * se agregue una tabla nueva aislada por tenant.
 */
export async function deleteFreshAdminTenants(
  sql: SqlClient,
  freshStaffUserId: string,
): Promise<string[]> {
  const rows = (await sql`
    SELECT tenant_id FROM tenant_staff_members WHERE staff_user_id = ${freshStaffUserId}
  `) as unknown as Array<{ tenant_id: string }>

  const deleted: string[] = []
  for (const { tenant_id: tid } of rows) {
    await sql`DELETE FROM audit_logs WHERE tenant_id = ${tid}`
    await sql`DELETE FROM notifications WHERE tenant_id = ${tid}`
    await sql`DELETE FROM cash_flows WHERE tenant_id = ${tid}`
    await sql`DELETE FROM daily_cash_closes WHERE tenant_id = ${tid}`
    // payments.booking_id -> bookings.id es la pata inversa del FK circular que bookings
    // tiene con payments (004_isolated_tables.sql): hay que anularlo antes o el DELETE de
    // bookings viola payments_booking_id_fkey.
    await sql`UPDATE payments SET booking_id = NULL WHERE tenant_id = ${tid}`
    await sql`DELETE FROM bookings WHERE tenant_id = ${tid}`
    await sql`DELETE FROM payments WHERE tenant_id = ${tid}`
    await sql`DELETE FROM tenant_player_bans WHERE tenant_id = ${tid}`
    await sql`DELETE FROM abonados WHERE tenant_id = ${tid}`
    await sql`DELETE FROM products WHERE tenant_id = ${tid}`
    await sql`DELETE FROM courts WHERE tenant_id = ${tid}`
    await sql`DELETE FROM player_tenant_relationships WHERE tenant_id = ${tid}`
    await sql`DELETE FROM tenant_staff_members WHERE tenant_id = ${tid}`
    await sql`DELETE FROM tenant_subscriptions WHERE tenant_id = ${tid}`
    await sql`DELETE FROM tenants WHERE id = ${tid}`
    deleted.push(tid)
  }
  return deleted
}
