'use client'

import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WhatsappIcon } from '@/components/icons/WhatsappIcon'
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
            <WhatsappIcon className="h-4 w-4 fill-green-600" />
            WhatsApp
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
