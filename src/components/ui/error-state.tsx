'use client'

import Link from 'next/link'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ErrorStateVariant = 'full' | 'contained' | 'inline'

export interface ErrorStateProps {
  variant?: ErrorStateVariant  // default 'contained'
  title: string
  description?: string
  digest?: string
  onRetry?: () => void
  retryLabel?: string  // default 'Reintentar'
  secondaryHref?: string
  secondaryLabel?: string
  secondaryIcon?: LucideIcon
}

export function ErrorState({
  variant = 'contained',
  title,
  description,
  digest,
  onRetry,
  retryLabel = 'Reintentar',
  secondaryHref,
  secondaryLabel,
  secondaryIcon: SecondaryIcon,
}: ErrorStateProps) {
  const wrapper = {
    full: 'flex min-h-dvh items-center justify-center bg-muted/50 px-4 py-12',
    contained: 'flex min-h-[60vh] items-center justify-center px-4 py-12',
    inline: '',
  }[variant]

  if (variant === 'inline') {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-6 dark:border-destructive/30 dark:bg-destructive/15">
        {/*
          text-destructive (red-600, #DC2626) sobre bg-destructive/10 mezclado
          con bg-background (slate-200) da 3.34:1 — falla AA. Mismo antipatrón
          documentado para emerald (texto saturado sobre tinte translúcido en
          superficie clara): el idiom correcto es un tono más oscuro en claro,
          el token original en oscuro (donde sí pasa).
        */}
        <p className="text-sm text-red-700 dark:text-destructive">{title}{description ? `. ${description}` : ''}</p>
        {onRetry ? (
          <button
            onClick={onRetry}
            className="mt-3 text-sm font-medium text-red-700 underline hover:no-underline dark:text-destructive"
            type="button"
          >
            {retryLabel}
          </button>
        ) : null}
      </div>
    )
  }

  const cardShadow = variant === 'full' ? 'shadow-lg' : 'shadow-xs'

  if (variant === 'contained') {
    return (
      <div className={wrapper}>
        <div className={cn('w-full max-w-md rounded-xl border border-border bg-card p-8 text-center', cardShadow)}>
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-inset ring-destructive/20 dark:bg-destructive/15">
            <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
          {digest ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Código de referencia:{' '}
              <span className="font-mono tabular-nums">{digest}</span>
            </p>
          ) : null}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {retryLabel}
              </button>
            ) : null}
            {secondaryHref && secondaryLabel ? (
              <Link
                href={secondaryHref}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {SecondaryIcon ? <SecondaryIcon className="h-4 w-4" aria-hidden="true" /> : null}
                {secondaryLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className={wrapper}>
      <div className={cn('w-full max-w-md rounded-xl border border-border bg-card p-8 text-center', cardShadow)}>
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-1 ring-inset ring-destructive/20 dark:bg-destructive/15">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
        {digest ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Código de referencia:{' '}
            <span className="font-mono tabular-nums">{digest}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {retryLabel}
            </button>
          ) : null}
          {secondaryHref && secondaryLabel ? (
            <Link
              href={secondaryHref}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors duration-150 hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {SecondaryIcon ? <SecondaryIcon className="h-4 w-4" aria-hidden="true" /> : null}
              {secondaryLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  )
}
