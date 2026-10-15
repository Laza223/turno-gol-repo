'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

/**
 * Submit del form de Google de /verify. Queda deshabilitado mientras la action
 * corre: un segundo clic arrancaría otro OAuth y pisaría el verifier PKCE del primero.
 */
export function GoogleRetryButton({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:opacity-60`}
    >
      {children}
    </button>
  )
}
