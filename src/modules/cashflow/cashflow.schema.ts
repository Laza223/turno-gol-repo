import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = z.string().regex(UUID_RE, 'UUID inválido')

// ── Output (response) contracts — doc15 §2 ────────────────────────────────────
// Mirror the cashflow domain rows (cashflow.types.ts) as serialized over the wire
// (Date → ISO string). `.strict()` so a new/renamed field surfaces as drift.

// POST /api/cash-flows → `{ data: CashFlowRow }`.
const cashFlowRowResponseSchema = z
  .object({
    id: uuid,
    tenantId: uuid,
    type: z.enum(['income', 'adjustment', 'expense']),
    category: z.enum(['booking', 'product_sale', 'other', 'no_show_correction', 'operating_expense']),
    amount: z.number().int(),
    method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
    description: z.string(),
    bookingId: uuid.nullable(),
    productId: uuid.nullable(),
    registeredBy: z.string(),
    occurredAt: z.string(),
    createdAt: z.string(),
  })
  .strict()

export const cashFlowResponseSchema = z.object({ data: cashFlowRowResponseSchema }).strict()

// The daily-close mutation itself is a Server Action (out of the Route Handler
// scope); the route-handler surface for "daily close" is the day summary, which
// carries the close row when the day is closed.
const dailyCashCloseResponseSchema = z
  .object({
    id: uuid,
    tenantId: uuid,
    date: z.string(),
    totalIncome: z.number().int(),
    totalAdjustments: z.number().int(),
    totalExpense: z.number().int(),
    balance: z.number().int(),
    declaredCash: z.number().int(),
    diffAmount: z.number().int(),
    note: z.string().nullable(),
    closedBy: z.string(),
    closedAt: z.string(),
  })
  .strict()

// GET /api/cash-flows/summary → `{ data: DaySummary }`.
export const daySummaryResponseSchema = z
  .object({
    data: z
      .object({
        date: z.string(),
        totalIncome: z.number().int(),
        totalAdjustments: z.number().int(),
        totalExpense: z.number().int(),
        balance: z.number().int(),
        byCategory: z.record(z.string(), z.number()),
        byMethod: z.record(z.string(), z.number()),
        isClosed: z.boolean(),
        close: dailyCashCloseResponseSchema.nullable(),
      })
      .strict(),
  })
  .strict()
