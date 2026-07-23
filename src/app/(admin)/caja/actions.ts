'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { uuid, dateStr, moneyCents, boundedText } from '@/shared/validation/primitives'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { adminRateLimited } from '@/shared/rate-limit/server-action'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { closeDailyRegister } from '@/modules/cashflow/daily-close.service'
import { openDay } from '@/modules/cashflow/cash-open.service'
import { cashFlowResponseSchema } from '@/modules/cashflow/cashflow.schema'
import { validateApiOutput } from '@/shared/api-output'
import {
  CloseDateInFutureError,
  DayAlreadyClosedError,
  DayAlreadyCloseExistsError,
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
  OpenDateInFutureError,
} from '@/modules/cashflow/cashflow.errors'
import type {
  CashFlowRow,
  DailyCashCloseRow,
  CreateCashFlowInput,
} from '@/modules/cashflow/cashflow.types'

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
  occurredAt: z.coerce.date().optional(),
  // Cruce #10: sin esta clave en el schema, z.object() la strippeaba en
  // safeParse y el ON CONFLICT (client_idempotency_key) DO NOTHING del
  // service nunca corría → doble-tap = venta duplicada en la caja.
  clientIdempotencyKey: uuid.optional(),
})

const closeDaySchema = z.object({
  date: dateStr,
  declaredCash: moneyCents.optional(),
  note: boundedText(500).optional(),
})

const openDaySchema = z.object({
  date: dateStr,
  openingCash: moneyCents,
  note: boundedText(300).optional(),
})

export type CashFlowActionResult =
  | { success: true; cashFlow: CashFlowRow }
  | { success: false; error: string }

export type CloseDayActionResult =
  | { success: true; close: DailyCashCloseRow }
  | { success: false; error: string }

export type OpenDayInput = { date: string; openingCash: number; note?: string }

export type OpenDayActionResult =
  | { success: true; openingCash: number }
  | { success: false; error: string }

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
  // antes del throw. Acá los services tiran antes de escribir, pero el patrón
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
    if (err instanceof DayAlreadyClosedError) {
      return { success: false, error: 'La caja de ese día ya fue cerrada. Registrá un ajuste compensatorio.' }
    }
    throw err
  }

  validateApiOutput(cashFlowResponseSchema, { data: cashFlow }, 'createCashFlowAction')
  revalidatePath('/caja')
  return { success: true, cashFlow }
}

export async function closeDayAction(
  date: string,
  declaredCash?: number,
  note?: string,
): Promise<CloseDayActionResult> {
  const parsed = closeDaySchema.safeParse({ date, declaredCash, note })
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  // Cruce #2: el cierre de caja es inmutable — requiere admin/manager activo.
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let close: DailyCashCloseRow
  try {
    close = await withTenantContext(tenant.id, (tx) =>
      closeDailyRegister(
        tenant.id,
        parsed.data.date,
        user.staffUserId,
        { declaredCash: parsed.data.declaredCash, note: parsed.data.note },
        tx,
      ),
    )
  } catch (err) {
    if (err instanceof CloseDateInFutureError) {
      return { success: false, error: 'No se puede cerrar una fecha futura.' }
    }
    if (err instanceof DayAlreadyCloseExistsError) {
      return { success: false, error: `La caja del ${parsed.data.date} ya fue cerrada.` }
    }
    throw err
  }

  revalidatePath('/caja')
  return { success: true, close }
}

export async function openDayAction(input: OpenDayInput): Promise<OpenDayActionResult> {
  const parsed = openDaySchema.safeParse(input)
  if (!parsed.success) return { success: false, error: 'Datos inválidos.' }
  // Abrir/corregir el fondo es operación de caja: mismo gate que el resto (admin+manager).
  const auth = await requireOperatorStaff()
  if (!auth.ok) return { success: false, error: auth.error }
  const { user, tenant } = auth

  const limited = await adminRateLimited(tenant.id)
  if (limited) return { success: false, error: limited }

  let openingCash: number
  try {
    const open = await withTenantContext(tenant.id, (tx) =>
      openDay(tenant.id, user.staffUserId, parsed.data, tx),
    )
    openingCash = open.openingCash
  } catch (err) {
    if (err instanceof OpenDateInFutureError) {
      return { success: false, error: 'No se puede abrir una fecha futura.' }
    }
    if (err instanceof DayAlreadyClosedError) {
      return { success: false, error: 'Ese día ya está cerrado.' }
    }
    throw err
  }

  revalidatePath('/caja')
  return { success: true, openingCash }
}
