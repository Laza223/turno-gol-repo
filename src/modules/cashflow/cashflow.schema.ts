import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = z.string().regex(UUID_RE, 'UUID inválido')

// ── Output (response) contracts — doc15 §2 ────────────────────────────────────
// Mirror the cashflow domain rows (cashflow.types.ts) as serialized over the wire
// (Date → ISO string). `z.strictObject` so a new/renamed field surfaces as drift.

// POST /api/cash-flows → `{ data: CashFlowRow }`.
const cashFlowRowResponseSchema = z.strictObject({
  id: uuid,
  tenantId: uuid,
  type: z.enum(['income', 'adjustment', 'expense']),
  category: z.enum(['booking', 'product_sale', 'other', 'no_show_correction', 'operating_expense']),
  amount: z.number().int(),
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
  description: z.string(),
  bookingId: uuid.nullable(),
  registeredBy: z.string(),
  occurredAt: z.string(),
  createdAt: z.string(),
})

export const cashFlowResponseSchema = z.strictObject({ data: cashFlowRowResponseSchema })
