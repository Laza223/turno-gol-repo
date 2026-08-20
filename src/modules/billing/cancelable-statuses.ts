import type { SubscriptionStatus } from './billing.types'

/**
 * Estados desde los que `billing.cancel()` permite pedir la baja voluntaria
 * (ver `lifecycle.service.transitionToCanceled`), MENOS `trialing` — todavía no
 * eligió plan, no hay nada que cancelar (decisión explícita, no la del FSM).
 *
 * POR QUÉ VIVE ACÁ Y NO EN `CancelSubscriptionSection.tsx`
 *
 * Vivía exportado desde ese componente, que es `'use client'`. Un Server
 * Component que importa un VALOR de un módulo client no recibe el valor: recibe
 * la referencia de módulo cliente que el bundler pone en su lugar. `/reactivar`
 * hacía `CANCELABLE.has(sub.status)` sobre esa referencia y explotaba con
 * `CANCELABLE.has is not a function` — la página entera caía en su error
 * boundary con un 500. Y `/reactivar` es la ÚNICA superficie que ve un dueño
 * `suspended`/`blocked`: la pantalla para pagar y la de darse de baja eran
 * inalcanzables.
 *
 * Verificado en la app corriendo (2026-08-20) con un tenant `suspended`, y con
 * control negativo: el 500 pasa igual con el archivo tal cual está en `main`.
 * Los tests unitarios de la página no lo veían porque mockean el módulo del
 * componente, y ahí `CANCELABLE` sí es un Set de verdad.
 *
 * Regla que se lleva: lo que un Server Component tenga que EJECUTAR no puede
 * vivir en un módulo `'use client'` — aunque el import compile y los tests
 * pasen.
 */
export const CANCELABLE: ReadonlySet<SubscriptionStatus> = new Set([
  'active',
  'past_due',
  'suspended',
])
