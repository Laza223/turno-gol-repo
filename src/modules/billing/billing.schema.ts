import { z } from 'zod'

const billingCycle = z.enum(['monthly', 'annual'])

/**
 * Canchas por las que se factura. Reemplaza al `planId` que antes viajaba en
 * el request: con una sola fila de precio activa (migr. 091) el plan lo
 * resuelve el servidor, y lo único que el dueño elige es la cantidad.
 *
 * Sin techo por decisión de producto, pero con un tope de cordura acá: un
 * número absurdo solo puede venir de un error o de alguien jugando con el
 * request, y el monto que genera es plata real. 200 canchas es varias veces
 * el complejo más grande que existe en el país.
 */
const billedCourts = z
  .number()
  .int('La cantidad de canchas tiene que ser un número entero')
  .min(1, 'El mínimo es una cancha')
  .max(200, 'Cantidad de canchas fuera de rango')

export const subscribeSchema = z.object({
  billedCourts,
  billingCycle,
})

/** Subir o bajar la cantidad de canchas facturadas. */
export const changeBilledCourtsSchema = z.object({
  billedCourts,
})

export const cancelSchema = z.object({
  reason: z.string().min(1, 'Ingresá el motivo').max(500, 'Máximo 500 caracteres'),
})

export const reactivateSchema = z.object({
  billedCourts,
  billingCycle,
})
