import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbTx } from '@/shared/db/client'

/**
 * `registerInscriptionPayment` tenía su propia copia del chequeo de
 * idempotencia por EXISTENCIA de clave — el mismo defecto que el 🔴 1 de la
 * revisión de la tanda #319-#324 (`docs/audit/2026-09-16-revision-tanda-319-324.md`),
 * copiado de `addBookingChargeAction` antes de que ese se arreglara. Con una
 * línea que reusa la clave pero cambia el monto, la excluía como "ya cobrada"
 * y el `ON CONFLICT` del insert dejaba guardado el monto VIEJO.
 *
 * Ahora las tres funciones comparten `resolveIdempotentCharges`. Acá se prueba
 * el cableado: el camino con Postgres real vive en
 * `tests/integration/tournament-inscriptions.test.ts`.
 */

vi.mock('@/modules/tournaments/tournament-team.service', () => ({ getTeam: vi.fn() }))
// `chargeSplitPayment` mockeado, `resolveIdempotentCharges` REAL: hace su
// propio `tx.execute` y este test encodea la secuencia exacta (mismo criterio
// que booking-charge-action.test.ts).
vi.mock('@/modules/cashflow/cashflow.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/cashflow/cashflow.service')>()),
  chargeSplitPayment: vi.fn(),
}))

import { registerInscriptionPayment } from '@/modules/tournaments/tournament-payment.service'
import { getTeam } from '@/modules/tournaments/tournament-team.service'
import { chargeSplitPayment } from '@/modules/cashflow/cashflow.service'
import {
  InscriptionChargeConflictError,
  InscriptionOverpaidError,
} from '@/modules/tournaments/tournament.errors'

const TENANT = '11111111-1111-4111-8111-111111111111'
const TEAM = '22222222-2222-4222-8222-222222222222'
const STAFF = '33333333-3333-4333-8333-333333333333'
const KEY = '44444444-4444-4444-8444-444444444444'

/** Arancel de $10.000. */
const FEE = 1_000_000

/**
 * `tx.execute` devuelve, EN ORDEN: 1) el `FOR UPDATE` sobre la fila del equipo,
 * 2) el SELECT de claves ya commiteadas (sólo si viene `clientIdempotencyKey`),
 * 3) `sumTeamPayments`.
 */
function mockTx(responses: unknown[][]): DbTx {
  const execute = vi.fn()
  for (const r of responses) execute.mockResolvedValueOnce(r)
  return { execute } as unknown as DbTx
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getTeam).mockResolvedValue({ name: 'Los Pibes', inscriptionFee: FEE } as never)
  vi.mocked(chargeSplitPayment).mockResolvedValue([] as never)
})

describe('registerInscriptionPayment — idempotencia por contenido', () => {
  it('un reintento idéntico no vuelve a cobrar ni rechaza por error', async () => {
    const tx = mockTx([
      [], // FOR UPDATE del equipo
      [{ key: `${KEY}-0`, amount: FEE, method: 'cash' }], // ya commiteado, MISMO cobro
      [{ paid: FEE }], // sumTeamPayments: el arancel ya está saldado
    ])

    await registerInscriptionPayment(
      TENANT,
      STAFF,
      { teamId: TEAM, charges: [{ amount: FEE, method: 'cash' }], clientIdempotencyKey: KEY },
      tx,
    )

    // Pendiente = 0 y aun así no tira InscriptionOverpaidError: nada nuevo se
    // está cobrando. El ON CONFLICT de chargeSplitPayment lo deja como está.
    expect(vi.mocked(chargeSplitPayment)).toHaveBeenCalled()
  })

  it('la misma clave con OTRO monto es conflicto, no un no-op silencioso', async () => {
    const tx = mockTx([
      [], // FOR UPDATE del equipo
      [{ key: `${KEY}-0`, amount: 300_000, method: 'cash' }], // ya se cobraron $3.000
    ])

    await expect(
      registerInscriptionPayment(
        TENANT,
        STAFF,
        { teamId: TEAM, charges: [{ amount: FEE, method: 'cash' }], clientIdempotencyKey: KEY },
        tx,
      ),
    ).rejects.toThrow(InscriptionChargeConflictError)

    expect(vi.mocked(chargeSplitPayment)).not.toHaveBeenCalled()
  })

  it('el conflicto viaja con el monto REAL ya guardado, para poder reconciliar', async () => {
    const tx = mockTx([[], [{ key: `${KEY}-0`, amount: 300_000, method: 'cash' }]])

    await expect(
      registerInscriptionPayment(
        TENANT,
        STAFF,
        { teamId: TEAM, charges: [{ amount: FEE, method: 'cash' }], clientIdempotencyKey: KEY },
        tx,
      ),
    ).rejects.toMatchObject({ teamName: 'Los Pibes', registeredCents: 300_000 })
  })

  it('un reintento que reusa la clave y AGREGA una línea valida sólo la nueva', async () => {
    const tx = mockTx([
      [], // FOR UPDATE del equipo
      [{ key: `${KEY}-0`, amount: FEE, method: 'cash' }], // línea 0 idéntica, ya commiteada
      [{ paid: FEE }], // el arancel ya está saldado: pendiente = 0
    ])

    // La línea 1 es NUEVA y no entra en lo pendiente → sobrecobro.
    await expect(
      registerInscriptionPayment(
        TENANT,
        STAFF,
        {
          teamId: TEAM,
          charges: [
            { amount: FEE, method: 'cash' },
            { amount: 700_000, method: 'transfer' },
          ],
          clientIdempotencyKey: KEY,
        },
        tx,
      ),
    ).rejects.toThrow(InscriptionOverpaidError)

    expect(vi.mocked(chargeSplitPayment)).not.toHaveBeenCalled()
  })

  it('sin clave de idempotencia el lote entero se valida contra lo pendiente', async () => {
    const tx = mockTx([
      [], // FOR UPDATE del equipo (sin clave, no hay SELECT de claves)
      [{ paid: 0 }],
    ])

    await registerInscriptionPayment(
      TENANT,
      STAFF,
      { teamId: TEAM, charges: [{ amount: FEE, method: 'cash' }] },
      tx,
    )

    expect(vi.mocked(chargeSplitPayment)).toHaveBeenCalled()
  })
})
