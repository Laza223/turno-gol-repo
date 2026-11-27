'use client'

import type { ReactNode } from 'react'

/**
 * Enlace de contacto de la ficha (WhatsApp o teléfono). En un complejo en `trial_expired`
 * avisa el clic (`trackExpiredContactAction`) sin frenar la navegación: el aviso es
 * fire-and-forget y nunca bloquea ni rompe el enlace. Sin `onTrack` es un enlace común.
 */
export default function ContactLink({
  href,
  channel,
  onTrack,
  className,
  children,
}: {
  href: string
  channel: 'whatsapp' | 'phone'
  /** La Server Action entra por prop (no se importa en un módulo cliente). */
  onTrack?: (channel: 'whatsapp' | 'phone') => Promise<void>
  className?: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      {...(channel === 'whatsapp' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={className}
      onClick={() => {
        onTrack?.(channel).catch(() => {})
      }}
    >
      {children}
    </a>
  )
}
