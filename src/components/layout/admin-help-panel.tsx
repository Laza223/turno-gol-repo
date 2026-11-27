'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, ChevronDown, Mail, Search } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { StaffRole } from '@/modules/staff/roles'
import { SUPPORT_EMAIL } from '@/shared/constants'
import { getHelpGuides, getHelpReportHref } from './admin-help-guides'

interface AdminHelpPanelProps {
  pathname: string
  staffRole?: StaffRole
  readOnly?: boolean
  open: boolean
  onClose: () => void
  restoreFocus: () => void
}

export function AdminHelpPanel({
  pathname,
  staffRole,
  readOnly,
  open,
  onClose,
  restoreFocus,
}: AdminHelpPanelProps) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [query, setQuery] = useState('')
  const searchId = useId()
  const guides = getHelpGuides({ pathname, staffRole, readOnly, query })

  function close() {
    setQuery('')
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <SheetContent
        side="right"
        className="w-full max-w-full overflow-hidden pt-[env(safe-area-inset-top)] sm:max-w-[24rem] [&>button]:top-[calc(0.75rem+env(safe-area-inset-top))] [&>button]:grid [&>button]:h-11 [&>button]:w-11 [&>button]:place-items-center"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          titleRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
      >
        <div className="shrink-0 border-b border-border px-5 pt-6 pb-4">
          <SheetTitle ref={titleRef} tabIndex={-1} className="mb-4 pr-12 outline-none">
            Ayuda
          </SheetTitle>
          <label htmlFor={searchId} className="sr-only">
            ¿Qué querés hacer?
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              placeholder="¿Qué querés hacer?"
              className="pl-9 placeholder:text-muted-foreground"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">
          <p role="status" className="sr-only">
            {query.trim() && `${guides.length} ${guides.length === 1 ? 'resultado' : 'resultados'}`}
          </p>
          {guides.length === 0 ? (
            <div className="space-y-1 py-3 text-sm">
              <p className="font-medium text-foreground">No encontramos esa tarea.</p>
              <p className="text-muted-foreground">Probá con «turnos fijos» o «por cobrar».</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {guides.map((guide) => (
                <li key={guide.id}>
                  <details className="group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-sm font-medium text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden [&::-webkit-details-marker]:hidden">
                      {guide.title}
                      <ChevronDown
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground group-open:rotate-180"
                      />
                    </summary>
                    <div className="px-2 pt-1 pb-3">
                      <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
                        {guide.answer}
                      </p>
                      <Link
                        href={guide.href}
                        prefetch={false}
                        onNavigate={close}
                        className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}
                      >
                        {guide.linkLabel}
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 border-t border-border px-5 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <a
            href={getHelpReportHref(pathname)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            <Mail aria-hidden="true" className="size-4" />
            Reportar un problema
          </a>
          <p className="text-sm text-muted-foreground">{SUPPORT_EMAIL}</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
