import { z } from 'zod'
import { uuid, moneyCents, boundedText } from '@/shared/validation/primitives'

/**
 * Schemas Zod de entrada del módulo cantina. Los consumen las Server Actions
 * de /caja/cantina y /caja/productos (guard → parse → service).
 * Montos SIEMPRE en centavos ARS (integer).
 */

// Catálogo: límites generosos pero acotados (nombre corto = botón legible en
// el grid de venta; 60 años-friendly).
const productNameSchema = z.string().trim().min(1, 'El nombre no puede estar vacío.').max(40, 'Máximo 40 caracteres')

export const createProductSchema = z.object({
  name: productNameSchema,
  // positive (no moneyCents/nonnegative): la 048 exige CHECK price > 0 — un 0
  // acá pasaría Zod y explotaría en el INSERT con un 23514 crudo.
  price: z.number().int().positive('El precio debe ser mayor a 0.'),
  cost: moneyCents.nullish(),
  stock: z.number().int().min(0).max(100_000).nullish(),
  minStock: z.number().int().min(0).max(100_000).nullish(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
})

export const updateProductSchema = z.object({
  productId: uuid,
  patch: createProductSchema.partial().extend({
    isActive: z.boolean().optional(),
  }),
})

// Ticket: hasta 20 líneas distintas; qty por línea acotada como la venta actual.
const ticketLineSchema = z.object({
  productId: uuid,
  qty: z.number().int().min(1).max(99),
})

export const sellTicketSchema = z.object({
  lines: z.array(ticketLineSchema).min(1, 'El ticket necesita al menos un producto.').max(20),
  method: z.enum(['cash', 'transfer', 'mercadopago']),
  clientIdempotencyKey: uuid,
  // Opcional: la venta desde /caja/cantina no lo manda; la del panel del turno sí.
  bookingId: uuid.optional(),
})

// Fiados: nombre libre (no exige jugador registrado).
export const createTabSchema = z.object({
  debtorName: z.string().trim().min(1, 'Poné un nombre para el fiado.').max(80),
  lines: z.array(ticketLineSchema).min(1, 'El fiado necesita al menos un producto.').max(20),
  note: boundedText(300).optional(),
  clientIdempotencyKey: uuid,
})

// Método mixto (D2, Fase 1): 1-5 líneas de {monto, método} que tienen que
// sumar EXACTO el total del ticket — validado en settleTab (canteen-tab.service.ts).
const settleTabChargeSchema = z.object({
  amount: moneyCents.refine((v) => v > 0, 'El monto debe ser mayor a 0.'),
  method: z.enum(['cash', 'transfer', 'mercadopago']),
})

export const settleTabSchema = z.object({
  tabId: uuid,
  charges: z.array(settleTabChargeSchema).min(1, 'Ingresá al menos un cobro.').max(5),
  clientIdempotencyKey: uuid,
})

export const cancelTabSchema = z.object({
  tabId: uuid,
  reason: boundedText(300).min(1, 'Contá por qué se anula el fiado.'),
})

// Stock: la UI manda unidades TOTALES (packs × unidades por pack ya multiplicado).
export const registerPurchaseSchema = z
  .object({
    productId: uuid,
    units: z.number().int().min(1).max(100_000),
    unitCost: moneyCents.nullish(),
    updateProductCost: z.boolean().optional(),
    // "Pagalo de la caja" (migr. 050): crea el gasto expense/merchandise por
    // units × unitCost en la MISMA transacción que la reposición.
    expense: z.object({ method: z.enum(['cash', 'transfer', 'mercadopago']) }).optional(),
    note: boundedText(300).nullish(),
    clientIdempotencyKey: uuid,
  })
  .refine((v) => !v.expense || (v.unitCost != null && v.unitCost > 0), {
    message: 'Para pagar de la caja hace falta el costo por unidad.',
    path: ['unitCost'],
  })

export const registerStockExitSchema = z.object({
  productId: uuid,
  units: z.number().int().min(1).max(100_000),
  reason: z.enum(['waste', 'courtesy', 'internal_use']),
  // Motivo obligatorio: es lo que hace auditable una salida sin venta.
  note: boundedText(300).min(1, 'Contá el motivo de la salida.'),
  clientIdempotencyKey: uuid,
})

export const adjustStockSchema = z.object({
  productId: uuid,
  newStock: z.number().int().min(0).max(100_000),
  note: boundedText(300).min(1, 'Contá el motivo del ajuste.'),
  clientIdempotencyKey: uuid,
})
