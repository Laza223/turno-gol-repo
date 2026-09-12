'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid, moneyCents, boundedText } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { cashFlowResponseSchema } from '@/modules/cashflow/cashflow.schema'
import { validateApiOutput } from '@/shared/api-output'
import {
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
} from '@/modules/cashflow/cashflow.errors'
import type { CashFlowRow, CreateCashFlowInput } from '@/modules/cashflow/cashflow.types'

/** Margen para el desfasaje de reloj del navegador contra el del servidor. */
const OCCURRED_AT_CLOCK_SKEW_MS = 5 * 60_000

const createCashFlowSchema = z.object({
  type: z.enum(['income', 'adjustment', 'expense']),
  category: z.enum([
    'booking',
    'product_sale',
    'other',
    'no_show_correction',
    // 'operating_expense' se acepta por compat pero la UI ya no lo ofrece
    // (migr. 050: gastos con categoría específica).
    'operating_expense',
    'merchandise',
    'salaries',
    'utilities',
    'maintenance',
    'other_expense',
  ]),
  amount: moneyCents,
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
  description: boundedText(500),
  // R4 (ensayo general, hallazgo 🟡): SIN bookingId a propósito. Cobrar
  // vinculado a un booking tiene un único camino canónico —
  // addBookingChargeAction (reservas/actions.ts), que toma FOR UPDATE sobre
  // el booking y valida contra getBookingCharges antes de insertar. Este
  // schema no tenía ninguna de esas garantías: cualquier staff autenticado
  // podía invocar la Server Action directo (curl/devtools) con un bookingId
  // arbitrario y reproducir el síntoma de ENS-3 (turno de $100 "cobrado"
  // $570). La UI (RegisterMovementModal, CanteenQuickSale) nunca mandó este
  // campo. z.object() sin .strict() lo strippea en silencio si igual llega
  // en el input — createCashFlow queda con booking_id NULL siempre que se
  // invoca desde acá. El service (cashflow.service.ts) sigue aceptando
  // bookingId para sus callers legítimos (addBookingChargeAction,
  // recordDepositCashFlow) — no tocar esa firma.
  // coerce: a Server Action may deliver this as a Date or an ISO string across the boundary.
  //
  // Hardening (auditoría integral 2026-09-06): no tenía cota superior, así que
  // un movimiento se podía fechar en el futuro. La caja bucketea por día
  // operativo: una fecha adelantada mete plata en un cierre que todavía no
  // ocurrió, y el cierre de hoy nunca la cuenta. La tolerancia son minutos, no
  // cero, porque el instante lo pone el navegador y su reloj no es el del
  // servidor — sin margen, un cliente adelantado por segundos vería rechazado
  // un movimiento perfectamente normal.
  occurredAt: z.coerce
    .date()
    .refine((d) => d.getTime() <= Date.now() + OCCURRED_AT_CLOCK_SKEW_MS, {
      message: 'Un movimiento no se puede cargar con fecha futura.',
    })
    .optional(),
  // Cruce #10: sin esta clave en el schema, z.object() la strippeaba en
  // safeParse y el ON CONFLICT (client_idempotency_key) DO NOTHING del
  // service nunca corría → doble-tap = venta duplicada en la caja.
  clientIdempotencyKey: uuid.optional(),
})

export type CashFlowActionResult =
  { success: true; cashFlow: CashFlowRow } | { success: false; error: string }

export async function createCashFlowAction(
  input: CreateCashFlowInput,
): Promise<CashFlowActionResult> {
  const parsed = createCashFlowSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  // Cruce #2: rol leído de DB — solo admin/manager operan la caja.
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  // Regla de la clase (panel Fase 6): el catch va FUERA del contexto
  // transaccional — atrapar adentro y devolver un objeto commitea lo escrito
  // antes del throw. Acá el service tira antes de escribir, pero el patrón
  // uniforme evita que un refactor futuro herede la mina.
  let cashFlow: CashFlowRow
  try {
    cashFlow = await withTenantContext(tenant.id, (tx) =>
      createCashFlow(tenant.id, user.staffUserId, parsed.data, tx),
    )
  } catch (err) {
    if (err instanceof InvalidCashFlowTypeError || err instanceof InvalidCashFlowCategoryError) {
      return { success: false, error: (err as Error).message }
    }
    throw err
  }

  validateApiOutput(cashFlowResponseSchema, { data: cashFlow }, 'createCashFlowAction')
  // El movimiento se ve en /caja/cuentas: ahí viven el diario del día y los
  // totales. `/caja` (Vender) no muestra ninguno de los dos.
  revalidatePath('/caja/cuentas')
  return { success: true, cashFlow }
}
