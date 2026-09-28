import { cn } from '@/lib/utils'

/** Marca de "esto es un ejemplo" que llevan todos los fragmentos de producto de la página. */
export function ExampleTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground',
        className,
      )}
    >
      Ejemplo
    </span>
  )
}
