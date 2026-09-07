/**
 * FASE 2A de la auditoría de aislamiento (`docs/audit/2026-09-05-aislamiento-rls.md`).
 *
 * La fase 1 midió las REGLAS: policies, permisos, el rol restringido real. Lo
 * que no midió —y lo dice en sus límites— es el CONTENIDO: si hay datos ya
 * escritos que sólo pudo haber creado el agujero que se arregló. Esta sonda es
 * esa pregunta.
 *
 * El agujero (H-1 y su clase) permitía que un complejo escribiera filas a nombre
 * de un jugador que nunca fue su cliente. Cada consulta de acá busca la HUELLA
 * de eso, no el agujero: el agujero ya está tapado.
 *
 * DOS REGLAS DE DISEÑO, las dos aprendidas en la fase 1:
 *
 *  1. **Todo cero viene con su denominador.** Un "0 contaminados" sobre una
 *     tabla vacía no prueba nada, y es exactamente el modo de falla que arruina
 *     esta clase de medición. Si el denominador es 0, la fila se reporta como
 *     SIN DATOS y no como limpia.
 *  2. **No sale ningún dato de ninguna persona.** La sonda devuelve conteos.
 *     Ante un hallazgo, la consulta acotada que identifique las filas es una
 *     decisión aparte y del dueño.
 *
 * Solo lectura, y no por promesa: la sesión se abre con
 * `default_transaction_read_only = on`, así que un INSERT/UPDATE/DELETE que se
 * colara moriría con 25006. El último control lo demuestra intentando escribir.
 *
 * Uso:
 *   pnpm tsx scripts/probe-tenant-contamination.ts                  (local)
 *   PROBE_ENV_FILE=.env.production pnpm tsx scripts/probe-tenant-contamination.ts
 */
import { config } from 'dotenv'

const ENV_SOURCE = process.env.PROBE_ENV_FILE ?? '.env.test'
if (ENV_SOURCE !== 'platform') config({ path: ENV_SOURCE, override: true })

import postgres from 'postgres'
import { dbSslOptions } from '../src/shared/db/ssl'

type Sonda = {
  id: string
  titulo: string
  /** Qué significaría un número distinto de cero. */
  huella: string
  sql: string
  denominador: string
}

/**
 * Una relación es la LLAVE: `staff_can_see_related_players` deja leer los datos
 * personales de un jugador sólo si existe la fila. Por eso las tres primeras
 * sondas preguntan lo mismo desde tres tablas: filas escritas a nombre de un
 * jugador que no tiene relación con ese complejo.
 */
const SONDAS: Sonda[] = [
  {
    id: '2A.1',
    titulo: 'bloqueos a alguien que nunca fue cliente',
    huella:
      'la huella exacta de H-10: el bloqueo lo ve la persona bloqueada, y el softban automático SIEMPRE crea la relación primero, así que un bloqueo sin relación no lo pudo crear un camino legítimo',
    sql: `SELECT COUNT(*)::text AS n
          FROM tenant_player_bans b
          WHERE NOT EXISTS (
            SELECT 1 FROM player_tenant_relationships r
            WHERE r.tenant_id = b.tenant_id AND r.player_id = b.player_id
          )`,
    denominador: `SELECT COUNT(*)::text AS n FROM tenant_player_bans`,
  },
  {
    id: '2A.2',
    titulo: 'reservas a nombre de alguien que nunca fue cliente',
    huella:
      'la huella de H-1. OJO: la carga manual legítima tampoco crea la relación, así que esto es una SEÑAL y no una prueba — un jugador propio cuya relación nació después de la reserva también cae acá. Un número alto pide mirar; uno bajo pide mirar caso por caso',
    sql: `SELECT COUNT(*)::text AS n
          FROM bookings b
          WHERE b.player_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM player_tenant_relationships r
              WHERE r.tenant_id = b.tenant_id AND r.player_id = b.player_id
            )`,
    denominador: `SELECT COUNT(*)::text AS n FROM bookings WHERE player_id IS NOT NULL`,
  },
  {
    id: '2A.3',
    titulo: 'turnos fijos a nombre de alguien que nunca fue cliente',
    huella:
      'la huella del mismo agujero en el alta de abonado. Acá NO hay ruido legítimo: `createAbonado` llama a `ensurePTR` al final, así que todo abonado con jugador deja relación',
    sql: `SELECT COUNT(*)::text AS n
          FROM abonados a
          WHERE a.player_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM player_tenant_relationships r
              WHERE r.tenant_id = a.tenant_id AND r.player_id = a.player_id
            )`,
    denominador: `SELECT COUNT(*)::text AS n FROM abonados WHERE player_id IS NOT NULL`,
  },
  {
    id: '2A.4',
    titulo: 'relaciones que ninguna acción legítima justifica',
    huella:
      'el otro lado del mismo ataque: la relación FABRICADA. Una relación sin ninguna reserva ni turno fijo detrás es la llave sin la puerta. Ruido conocido: la vinculación manual de un contacto y la marca de ausencia también pueden dejarla, así que un número chico no es alarma por sí solo',
    sql: `SELECT COUNT(*)::text AS n
          FROM player_tenant_relationships r
          WHERE NOT EXISTS (
              SELECT 1 FROM bookings b
              WHERE b.tenant_id = r.tenant_id AND b.player_id = r.player_id
            )
            AND NOT EXISTS (
              SELECT 1 FROM abonados a
              WHERE a.tenant_id = r.tenant_id AND a.player_id = r.player_id
            )`,
    denominador: `SELECT COUNT(*)::text AS n FROM player_tenant_relationships`,
  },
  {
    id: '2A.5',
    titulo: 'credenciales de MercadoPago que NO tienen forma de sobre cifrado',
    huella:
      'el otro invariante del informe: `tenants` no tiene seguridad de fila, así que el cifrado es la única barrera. Una credencial en claro empieza con APP_USR o TEST; el sobre cifrado es hex:hex:hex',
    sql: `SELECT COUNT(*)::text AS n
          FROM tenants
          WHERE (mp_access_token IS NOT NULL AND mp_access_token !~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$')
             OR (mp_refresh_token IS NOT NULL AND mp_refresh_token !~ '^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$')`,
    denominador: `SELECT COUNT(*)::text AS n FROM tenants
                  WHERE mp_access_token IS NOT NULL OR mp_refresh_token IS NOT NULL`,
  },
  {
    id: '2A.6',
    titulo: 'personal activo en más de un complejo',
    huella:
      'no es contaminación: es la PRECONDICIÓN del hallazgo rojo de la auditoría integral (dos fuentes para "el complejo activo"). Con cero, ese hallazgo no puede estar mordiendo hoy',
    sql: `SELECT COUNT(*)::text AS n FROM (
            SELECT staff_user_id FROM tenant_staff_members
            WHERE is_active GROUP BY staff_user_id HAVING COUNT(*) > 1
          ) AS x`,
    denominador: `SELECT COUNT(DISTINCT staff_user_id)::text AS n FROM tenant_staff_members WHERE is_active`,
  },
]

/** Los permisos que las migraciones 084 y 085 dejaron, medidos donde importa. */
const PERMISOS: Array<{ que: string; sql: string; esperado: string }> = [
  {
    que: 'reviews.player_id ilegible para el rol web (migr. 084)',
    sql: `SELECT has_column_privilege('turnogol_app','reviews','player_id','SELECT')::text AS v`,
    esperado: 'false',
  },
  {
    que: 'reviews.rating legible para el rol web (control negativo)',
    sql: `SELECT has_column_privilege('turnogol_app','reviews','rating','SELECT')::text AS v`,
    esperado: 'true',
  },
  {
    que: 'el rol web no puede borrar complejos (migr. 085)',
    sql: `SELECT has_table_privilege('turnogol_app','tenants','DELETE')::text AS v`,
    esperado: 'false',
  },
  {
    que: 'el rol web no puede escribir el catálogo de planes (migr. 085)',
    sql: `SELECT has_table_privilege('turnogol_app','plans','UPDATE')::text AS v`,
    esperado: 'false',
  },
  {
    que: 'el rol web sí puede leer complejos (control negativo)',
    sql: `SELECT has_table_privilege('turnogol_app','tenants','SELECT')::text AS v`,
    esperado: 'true',
  },
]

function fila(cols: string[], anchos: number[]): string {
  return cols.map((c, i) => c.padEnd(anchos[i]!)).join('  ')
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL no está seteada; no hay nada que sondear.')
    process.exit(1)
  }
  const destino = new URL(url).host

  const sql = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => {},
    ssl: dbSslOptions(url),
    // La barrera real: cualquier escritura muere con 25006 antes de tocar nada.
    connection: { default_transaction_read_only: true },
  })

  let hallazgos = 0
  let sinDatos = 0

  try {
    const [quien] = await sql<Array<{ rol: string; base: string }>>`
      SELECT current_user AS rol, current_database() AS base
    `
    console.log(`\nSonda de contaminación — fase 2A`)
    console.log(`destino: ${destino} · base: ${quien!.base} · rol: ${quien!.rol}`)
    console.log(`origen de variables: ${ENV_SOURCE}\n`)

    const anchos = [6, Math.max(...SONDAS.map((x) => x.titulo.length)) + 2, 12, 16, 10]
    console.log(fila(['id', 'qué se busca', 'encontrado', 'de un total de', 'veredicto'], anchos))
    console.log('-'.repeat(anchos.reduce((a, b) => a + b + 2, 0)))

    for (const s of SONDAS) {
      const [r] = (await sql.unsafe(s.sql)) as unknown as Array<{ n: string }>
      const [d] = (await sql.unsafe(s.denominador)) as unknown as Array<{ n: string }>
      const n = Number(r!.n)
      const total = Number(d!.n)
      // Un cero sobre un universo vacío no es un aprobado: es una medición que
      // no ocurrió. Se reporta distinto a propósito.
      const veredicto = total === 0 ? 'SIN DATOS' : n === 0 ? 'limpio' : 'MIRAR'
      if (veredicto === 'MIRAR') hallazgos += 1
      if (veredicto === 'SIN DATOS') sinDatos += 1
      console.log(fila([s.id, s.titulo, String(n), String(total), veredicto], anchos))
    }

    console.log(`\nPermisos vigentes (cierra el lazo de las migraciones 084 y 085):`)
    for (const p of PERMISOS) {
      const [r] = (await sql.unsafe(p.sql)) as unknown as Array<{ v: string }>
      const ok = r!.v === p.esperado
      if (!ok) hallazgos += 1
      console.log(`  ${ok ? 'ok  ' : 'MAL '} ${p.que} → ${r!.v} (esperado ${p.esperado})`)
    }

    // Control de la sonda: si esto NO tira, la sesión no es de solo lectura y
    // todo lo de arriba se midió con permiso de escribir.
    let bloqueada = false
    try {
      await sql.unsafe(`CREATE TEMP TABLE sonda_solo_lectura (x int)`)
    } catch {
      bloqueada = true
    }
    console.log(
      `\nControl de la propia sonda: la sesión ${bloqueada ? 'RECHAZA escribir (correcto)' : 'ACEPTA ESCRIBIR — el modo solo lectura NO está activo'}`,
    )
    if (!bloqueada) hallazgos += 1

    console.log(
      `\nResumen: ${hallazgos} para mirar · ${sinDatos} sin datos suficientes para afirmar nada\n`,
    )
    if (hallazgos > 0) process.exitCode = 1
  } finally {
    await sql.end()
  }
}

void main()
