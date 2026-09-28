'use client'

import { useEffect } from 'react'
import { storeReferralCode } from '@/lib/referral-storage'

/**
 * Guarda el código en localStorage al montar la landing (B2): cubre al
 * visitante que sigue navegando el sitio (`/para-complejos`, `/precios`) y se
 * registra después, cuando `/register` ya no tiene el `?ref=` en la URL.
 * Componente cliente mínimo — la page es un Server Component.
 */
export function PersistReferralCode({ code }: { code: string }) {
  useEffect(() => {
    storeReferralCode(code)
  }, [code])
  return null
}
