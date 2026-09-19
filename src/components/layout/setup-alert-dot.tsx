import { cn } from '@/lib/utils'

/**
 * Punto rojo de "hay algo por completar" (el típico de las apps). Un aviso que solo
 * existe como color no llega a quien no lo ve, así que lleva un texto `sr-only`:
 * con `label` sale pegado al punto; sin `label` el que lo usa pone el texto donde
 * el lector de pantalla lo lea en orden (después del nombre del ítem, no antes).
 * Quien lo usa lo posiciona con `className`; se va solo cuando se completa lo que
 * faltaba, no hay nada que descartar.
 */
export function SetupAlertDot({ label, className }: { label?: string; className?: string }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn('h-2 w-2 shrink-0 rounded-full bg-red-500 dark:bg-red-400', className)}
      />
      {label && <span className="sr-only">{label}</span>}
    </>
  )
}
