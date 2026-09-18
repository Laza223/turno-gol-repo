import { formatArs } from '@/lib/format'

/**
 * Copy del aviso de "esto te sube la cuota", compartido entre la Server Action
 * y el diálogo que lo muestra.
 *
 * Vive en su propio módulo (no en `actions.ts`) porque `actions.ts` es
 * `'use server'`: ahí solo pueden exportarse funciones async, y estos builders
 * son sincrónicos y los necesita también el cliente. Vive fuera de
 * `components/` porque el que lo importa primero es la Server Action.
 *
 * Nota de unificación: `settings/facturacion` tiene su propio desglose de
 * precio. Los dos salen de `@/modules/billing/pricing`, así que los números no
 * pueden divergir, pero el copy sí está duplicado a propósito por ahora — se
 * puede unificar después, cuando el de facturación esté cerrado.
 */

/** Lo que cambia en la cuota si la operación sigue adelante. Centavos ARS. */
export type BillingChangePreview = {
  /** Canchas por las que se factura hoy (`tenant_subscriptions.billed_courts`). */
  currentBilledCourts: number
  /** Canchas por las que se pasaría a facturar = canchas online después del cambio. */
  nextBilledCourts: number
  /** Cuota mensual de lista con `currentBilledCourts`. */
  currentMonthlyCents: number
  /** Cuota mensual de lista con `nextBilledCourts`. */
  nextMonthlyCents: number
  /** En prueba gratis todavía no se cobró un peso: el copy tiene que decirlo. */
  isTrialing: boolean
}

/** "Esto suma tu 5ª cancha". El ordinal femenino va pegado al número, sin punto. */
export function billingChangeTitle(preview: BillingChangePreview): string {
  return `Esto suma tu ${preview.nextBilledCourts}ª cancha`
}

/**
 * El aviso en criollo, en una frase. Dos versiones porque son dos situaciones
 * distintas de plata, no dos redacciones del mismo hecho:
 *
 * - en prueba, el cambio se aplica en el acto y todavía no se cobró nada;
 * - con la suscripción activa, lo que queda del período va sin cargo y la
 *   cuota nueva arranca en el próximo cobro (decisión 2026-09-17, P4: sumar o
 *   sacar una cancha NUNCA se cobra prorrateado).
 */
export function billingChangeMessage(preview: BillingChangePreview): string {
  const next = formatArs(preview.nextMonthlyCents)
  if (preview.isTrialing) {
    return `Estás en prueba gratis, así que todavía no te cobramos nada. Cuando empiece a correr tu cuota, va a ser de ${next} por mes.`
  }
  const current = formatArs(preview.currentMonthlyCents)
  return `Tu cuota pasa de ${current} a ${next} por mes, desde tu próximo cobro. Lo que queda de este mes va sin cargo.`
}
