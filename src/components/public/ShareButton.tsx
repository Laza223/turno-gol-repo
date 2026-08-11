'use client'

import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type Props = {
  /** URL absoluta a compartir. Si falta, usa la URL actual al hacer click. */
  url?: string
  /** Texto para el mensaje de WhatsApp. */
  message?: string
  label?: string
  className?: string
}

/** Botón "Compartir": copiar enlace o enviar por WhatsApp. */
export default function ShareButton({ url, message, label = 'Compartir', className }: Props) {
  const { toast } = useToast()
  const [copied, setCopied] = useState(false)

  function resolveUrl(): string {
    if (url) return url
    return typeof window !== 'undefined' ? window.location.href : ''
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(resolveUrl())
      setCopied(true)
      toast({ title: 'Enlace copiado', variant: 'success' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'No se pudo copiar el enlace.', variant: 'destructive' })
    }
  }

  const waText = encodeURIComponent(`${message ? `${message} ` : ''}${resolveUrl()}`)
  const waHref = `https://wa.me/?text=${waText}`

  return (
    // modal={false}: es un menú de acciones liviano (copiar enlace / WhatsApp),
    // no un diálogo que deba bloquear el resto de la página. Con el default
    // (modal=true) Radix llama hideOthers() y marca aria-hidden todo el árbol
    // fuera del portal —incluido el propio trigger, que sigue siendo
    // focuseable— violando aria-hidden-focus (axe).
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'group inline-flex h-11 items-center gap-2 rounded-xl border border-border/50 bg-card/60 px-4 text-sm font-semibold text-foreground/90 shadow-xs backdrop-blur-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-card hover:border-emerald-500/30 dark:hover:border-emerald-500/40 hover:text-primary hover:shadow-md active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500',
            className,
          )}
        >
          <Share2
            className="h-4 w-4 transition-transform duration-200 group-hover:scale-110"
            aria-hidden
          />
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={copyLink} className="cursor-pointer gap-2">
          {copied ? (
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : (
            <Copy className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
          {copied ? 'Copiado' : 'Copiar enlace'}
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer gap-2">
          <a href={waHref} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-green-600" aria-hidden>
              <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.027zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
            WhatsApp
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
