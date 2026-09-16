import { describe, expect, it } from 'vitest'
import { resolveIdempotentCharges, type SplitCharge } from '@/modules/cashflow/cashflow.service'
import type { DbTx } from '@/shared/db/client'
import { formatArs } from '@/lib/format'

/**
 * 🔴 1 de la revisión de la tanda #319-#324
 * (`docs/audit/2026-09-16-revision-tanda-319-324.md`).
 *
 * El escenario que motiva el archivo entero: turno de $10.000, el mostrador
 * cobra $6.000, la tablet pierde la respuesta pero el INSERT commiteó. El
 * admin reintenta con $10.000 creyendo que no entró nada. Antes de este fix la
 * caja se quedaba con $6.000, el cartel decía "Cobro registrado — $10.000" y
 * los $4.000 de saldo no se los mostraba nadie.
 *
 * La clave NO se rota del lado del cliente ante un error de red a propósito:
 * no se sabe si el cobro entró, y una clave nueva convertiría esa duda en un
 * cobro duplicado seguro. Por eso la decisión se toma acá, contra la DB.
 */

const TENANT = '11111111-1111-1111-1111-111111111111'
const KEY = '22222222-2222-2222-2222-222222222222'

type CommittedRow = { key: string; amount: number; method: string }

/** `tx` mínimo: el helper sólo usa `execute` y lee el resultado como array. */
function fakeTx(rows: CommittedRow[]): DbTx {
  return { execute: () => Promise.resolve(rows) } as unknown as DbTx
}

const cash = (amount: number): SplitCharge => ({ amount, method: 'cash' })

describe('resolveIdempotentCharges', () => {
  it('sin clave de idempotencia, todo el lote es nuevo', async () => {
    const res = await resolveIdempotentCharges(
      TENANT,
      [cash(600_000), cash(400_000)],
      undefined,
      fakeTx([]),
    )
    expect(res).toEqual({ ok: true, newChargingCents: 1_000_000 })
  })

  it('clave sin nada commiteado: todo el lote es nuevo y se valida entero', async () => {
    const res = await resolveIdempotentCharges(TENANT, [cash(600_000)], KEY, fakeTx([]))
    expect(res).toEqual({ ok: true, newChargingCents: 600_000 })
  })

  it('reintento idéntico: no vuelve a cobrar nada (Fix #55 sigue vivo)', async () => {
    const res = await resolveIdempotentCharges(
      TENANT,
      [cash(600_000)],
      KEY,
      fakeTx([{ key: `${KEY}-0`, amount: 600_000, method: 'cash' }]),
    )
    // 0 es lo correcto: el pendiente YA bajó por ese cobro, así que revalidarlo
    // contra el pendiente nuevo rechazaría un reintento legítimo.
    expect(res).toEqual({ ok: true, newChargingCents: 0 })
  })

  it('el reintento con OTRO monto se rechaza nombrando el monto real', async () => {
    const res = await resolveIdempotentCharges(
      TENANT,
      [cash(1_000_000)],
      KEY,
      fakeTx([{ key: `${KEY}-0`, amount: 600_000, method: 'cash' }]),
    )
    expect(res.ok).toBe(false)
    if (res.ok) throw new Error('debía rechazar el conflicto de contenido')
    // Lo que rompía antes: esto daba newCharging = 0, se salteaba el FOR UPDATE
    // y la validación contra el pendiente, y el ON CONFLICT devolvía la fila
    // vieja con success: true.
    expect(res.error).toContain(formatArs(600_000))
  })

  it('la misma clave con otro MÉTODO también es conflicto', async () => {
    const res = await resolveIdempotentCharges(
      TENANT,
      [{ amount: 600_000, method: 'transfer' }],
      KEY,
      fakeTx([{ key: `${KEY}-0`, amount: 600_000, method: 'cash' }]),
    )
    expect(res.ok).toBe(false)
  })

  it('reintento parcial: la línea ya commiteada se excluye y la nueva se valida', async () => {
    const res = await resolveIdempotentCharges(
      TENANT,
      [cash(600_000), cash(400_000)],
      KEY,
      fakeTx([{ key: `${KEY}-0`, amount: 600_000, method: 'cash' }]),
    )
    // Sólo los $4.000 nuevos van contra el pendiente recalculado.
    expect(res).toEqual({ ok: true, newChargingCents: 400_000 })
  })

  it('lote vacío no consulta la DB ni suma nada', async () => {
    const res = await resolveIdempotentCharges(TENANT, [], KEY, fakeTx([]))
    expect(res).toEqual({ ok: true, newChargingCents: 0 })
  })
})
