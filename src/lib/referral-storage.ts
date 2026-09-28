/**
 * Persistencia en localStorage del código de referido capturado por `?ref=` en
 * `/register` o al visitar la landing `/r/<CODE>` (B2): cubre al visitante que
 * navega el sitio (`/para-complejos`, `/precios`) y se registra después sin el
 * query param. Prioridad en `/register`: `?ref` válido > localStorage > nada.
 *
 * Client-safe a propósito (sin drizzle ni `next/server`): lo importan tanto
 * `RegisterCard.tsx` como la landing `/r/[code]`, dos componentes `'use client'`.
 */
const REFERRAL_STORAGE_KEY = 'turnogol:referral-code'

export function readStoredReferralCode(): string | null {
  try {
    return localStorage.getItem(REFERRAL_STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeReferralCode(code: string): void {
  try {
    localStorage.setItem(REFERRAL_STORAGE_KEY, code)
  } catch {
    // Modo privado / storage lleno: seguimos sin persistir.
  }
}
