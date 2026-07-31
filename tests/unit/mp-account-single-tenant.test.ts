import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Una cuenta de MercadoPago cobra para UN solo complejo (decisión 2026-07-31).
 *
 * El caso que la motiva se reprodujo en producción: dos cuentas de TurnoGol
 * distintas conectaron la MISMA cuenta de MP. No falló ninguna autorización
 * —el callback exige state firmado + sesión del mismo tenant + rol admin— sino
 * que faltaba la regla: MercadoPago guarda el consentimiento por (usuario,
 * aplicación), así que a partir del segundo intento conecta sin preguntar nada.
 *
 * Estos tests miran el CÓDIGO y el SQL, no un mock: el chequeo vive en un route
 * handler que hace OAuth real, y lo que hay que proteger es que nadie lo saque
 * ni afloje el índice. La verificación de comportamiento con DB real va en
 * tests/integration.
 */

const callback = readFileSync('src/app/api/mp/callback/route.ts', 'utf8')
const migracionCruda = readFileSync(
  'src/shared/db/migrations/069_mp_account_single_tenant.sql',
  'utf8',
)

/**
 * Sin los comentarios: el racional de esta migración MENCIONA los statements
 * que explica ("si no, el CREATE UNIQUE INDEX falla…"), así que buscar sobre el
 * texto crudo mide el orden de la prosa y no el del SQL. Pasó exactamente eso
 * al escribir estos tests.
 */
const migracion = migracionCruda
  .split(/\r?\n/)
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

describe('callback de MercadoPago', () => {
  it('chequea que la cuenta no esté tomada ANTES de guardarla', () => {
    const iChequeo = callback.indexOf('findTenantUsingMpAccount')
    const iGuardado = callback.indexOf('await connectMercadoPago')
    expect(iChequeo).toBeGreaterThan(-1)
    expect(iGuardado).toBeGreaterThan(-1)
    // Si se guardara primero, el índice único tiraría un error de constraint y
    // el complejo vería una pantalla rota en vez del mensaje explicativo.
    expect(iChequeo).toBeLessThan(iGuardado)
  })

  it('el error nombra al complejo que ya usa esa cuenta', () => {
    // Sin el nombre, el dueño no sabe si chocó con algo suyo o con algo ajeno.
    expect(callback).toContain('mp_already_connected')
    expect(callback).toMatch(/complejo=\$\{encodeURIComponent\(/)
  })

  it('el nickname no puede tumbar la conexión', () => {
    // Perder el apodo de la cuenta no justifica perder la conexión de cobro.
    const fn = callback.slice(
      callback.indexOf('async function fetchMpNickname'),
      callback.indexOf('const querySchema'),
    )
    expect(fn).toContain('catch')
    expect(fn).toMatch(/return null/)
  })
})

describe('migración 069', () => {
  it('resuelve los duplicados ANTES de crear el índice', () => {
    const iUpdate = migracion.indexOf('UPDATE tenants')
    const iIndice = migracion.indexOf('CREATE UNIQUE INDEX')
    expect(iUpdate).toBeGreaterThan(-1)
    expect(iIndice).toBeGreaterThan(-1)
    // Al revés, el CREATE INDEX falla contra una base que ya tiene duplicados
    // (producción los tenía) y la migración queda inaplicable.
    expect(iUpdate).toBeLessThan(iIndice)
  })

  it('gana el que conectó primero', () => {
    expect(migracion).toMatch(/ORDER BY mp_connected_at ASC/)
    expect(migracion).toMatch(/pos > 1/)
  })

  it('el índice es parcial: los NULL no compiten', () => {
    // Casi todos los complejos tienen mp_user_id NULL; sin el WHERE el índice
    // sería innecesariamente grande.
    expect(migracion).toMatch(/CREATE UNIQUE INDEX[\s\S]*WHERE mp_user_id IS NOT NULL/)
  })

  it('desconecta credenciales, no borra el complejo', () => {
    // El complejo que pierde el desempate sigue existiendo con sus reservas y
    // su caja: solo vuelve a ver el botón "Conectar MercadoPago".
    expect(migracion).toMatch(/SET mp_access_token = NULL/)
    expect(migracion).not.toMatch(/DELETE FROM tenants/)
  })
})
