'use client'

import { AlertCircle, CheckCircle2 } from 'lucide-react'
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'
import { useToast } from '@/hooks/use-toast'

/**
 * Mounts the toast viewport (design-system §6: bottom-right, aria-live polite
 * via Radix, success auto-dismiss 4s / errors persist). Render once in the
 * root layout.
 */
export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          variant={t.variant}
          duration={t.duration}
          open={t.open}
          onOpenChange={(open) => {
            if (!open) dismiss(t.id)
          }}
        >
          {/* Ícono por variante: hereda el color del texto del toast (ya AA). */}
          {t.variant === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : t.variant === 'destructive' ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          ) : null}
          <div className="grid flex-1 gap-1">
            {t.title ? <ToastTitle>{t.title}</ToastTitle> : null}
            {t.description ? (
              <ToastDescription>{t.description}</ToastDescription>
            ) : null}
          </div>
          {t.action ? (
            <ToastAction
              altText={t.action.label}
              onClick={() => {
                t.action?.onClick()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </ToastAction>
          ) : null}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  )
}
