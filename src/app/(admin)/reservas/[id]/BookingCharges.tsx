'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, Banknote, Check, ChevronDown, Coins, CreditCard } from 'lucide-react'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { toast } from '@/hooks/use-toast'
import { formatArs } from '@/lib/format'
import { METHOD_LABELS } from '@/lib/payment-method'
import { MoneyInput } from '@/components/ui/money-input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { resolveDepositDisplayStatus } from '../deposit-display'
import type { BookingChargeRow } from '../queries'
import type { AddBookingChargeInput, BookingChargeActionResult } from '../actions'

type Props = {
  bookingId: string
  priceSnapshot: number
  depositAmount: number
  depositStatus: string
  /** Ver `deposit-display.ts`: un pago tardío deja `depositStatus='pending'` con la plata ya devuelta. */
  depositRefunded?: boolean
  charges: BookingChargeRow[]
  chargesTotal: number
  /**
   * Server Action por PROP, no por import (ver comentario homólogo en
   * ReservasPolicyForm.tsx): '../actions' es `'use server'` y arrastra
   * node:async_hooks, que rompe Storybook.
   */
  addBookingChargeAction: (input: AddBookingChargeInput) => Promise<BookingChargeActionResult>
}

const PAYMENT_METHODS = [
  {
    value: 'cash',
    label: 'Efectivo',
    icon: Banknote,
    accentClass: 'text-emerald-700 dark:text-emerald-400',
  },
  {
    value: 'transfer',
    label: 'Transferencia',
    icon: ArrowRightLeft,
    accentClass: 'text-blue-700 dark:text-blue-400',
  },
  {
    value: 'mercadopago',
    label: 'MercadoPago',
    icon: CreditCard,
    accentClass: 'text-sky-700 dark:text-sky-400',
  },
  {
    value: 'other',
    label: 'Otro',
    icon: Coins,
    accentClass: 'text-purple-700 dark:text-purple-400',
  },
] as const

const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  pending: 'pendiente',
  refunded: 'reembolsada',
  not_required: 'no requerida',
}

export default function BookingCharges({
  bookingId,
  priceSnapshot,
  depositAmount,
  depositStatus,
  depositRefunded,
  charges,
  chargesTotal,
  addBookingChargeAction,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [amountCents, setAmountCents] = useState<number | null>(null)
  const [method, setMethod] = useState<'cash' | 'transfer' | 'mercadopago' | 'other'>('cash')
  const [isMethodOpen, setIsMethodOpen] = useState(false)

  const {
    depositCounted,
    totalPaid,
    pending: pendingAmount,
  } = useMemo(
    () =>
      summarizeBookingCharges({
        priceSnapshot,
        depositAmount,
        depositStatus,
        chargesTotal,
      }),
    [priceSnapshot, depositAmount, depositStatus, chargesTotal],
  )
  const isPaidInFull = pendingAmount === 0
  // Solo la ETIQUETA. `summarizeBookingCharges` de arriba sigue recibiendo el
  // `depositStatus` crudo: los totales son plata, no texto.
  const depositDisplayStatus = resolveDepositDisplayStatus(depositStatus, depositRefunded)

  const [chargeMode, setChargeMode] = useState<'single' | 'split'>('single')
  const [splitCents1, setSplitCents1] = useState<number | null>(null)
  const [splitMethod1, setSplitMethod1] = useState<'cash' | 'transfer' | 'mercadopago' | 'other'>(
    'cash',
  )
  const [splitMethod2, setSplitMethod2] = useState<'cash' | 'transfer' | 'mercadopago' | 'other'>(
    'transfer',
  )
  const [isMethod1Open, setIsMethod1Open] = useState(false)
  const [isMethod2Open, setIsMethod2Open] = useState(false)

  function openForm() {
    setError(null)
    setChargeMode('single')
    setAmountCents(pendingAmount > 0 ? pendingAmount : null)
    setMethod('cash')

    // Defaults para cobro dividido (50% en Pago 1, resto en Pago 2)
    const halfCents = pendingAmount > 0 ? Math.round(pendingAmount / 2) : 0
    setSplitCents1(halfCents > 0 ? halfCents : null)
    setSplitMethod1('cash')
    setSplitMethod2('transfer')
    setOpen(true)
  }

  const splitCents1Value = splitCents1 ?? 0
  const splitCents2Value = Math.max(0, pendingAmount - splitCents1Value)

  function onSubmit() {
    setError(null)

    if (chargeMode === 'split') {
      if (splitCents1 == null || splitCents1 <= 0) {
        setError('Ingresá un monto mayor a $0 para el primer cobro.')
        return
      }
      if (splitCents1 >= pendingAmount) {
        setError('El primer pago no puede ser igual o mayor al total en un pago dividido.')
        return
      }
      if (splitCents2Value <= 0) {
        setError('El segundo pago debe ser mayor a $0.')
        return
      }

      const amount1 = splitCents1
      const amount2 = splitCents2Value

      startTransition(async () => {
        const key1 =
          typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined
        const key2 =
          typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined

        const res1 = await addBookingChargeAction({
          bookingId,
          amount: amount1,
          method: splitMethod1,
          clientIdempotencyKey: key1,
        })

        if (!res1.success) {
          setError(`Error en cobro 1 (${METHOD_LABELS[splitMethod1]}): ${res1.error}`)
          return
        }

        const res2 = await addBookingChargeAction({
          bookingId,
          amount: amount2,
          method: splitMethod2,
          clientIdempotencyKey: key2,
        })

        if (!res2.success) {
          setError(
            `Cobro 1 (${formatArs(amount1)}) registrado. Error en cobro 2 (${METHOD_LABELS[splitMethod2]}): ${res2.error}`,
          )
          router.refresh()
          return
        }

        toast({
          title: 'Cobro dividido registrado',
          description: `${formatArs(amount1)} (${METHOD_LABELS[splitMethod1]}) + ${formatArs(amount2)} (${METHOD_LABELS[splitMethod2]})`,
          variant: 'success',
        })
        setOpen(false)
        setAmountCents(null)
        router.refresh()
      })
      return
    }

    // Modo individual ('single')
    if (amountCents == null || amountCents <= 0) {
      setError('Ingresá un monto mayor a 0.')
      return
    }
    const amount = amountCents
    if (amount > pendingAmount) {
      setError(`El cobro (${formatArs(amount)}) supera lo pendiente (${formatArs(pendingAmount)}).`)
      return
    }
    const clientIdempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined

    startTransition(async () => {
      const res = await addBookingChargeAction({ bookingId, amount, method, clientIdempotencyKey })
      if (res.success) {
        toast({ title: 'Cobro registrado', variant: 'success' })
        setOpen(false)
        setAmountCents(null)
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <section className="card-premium rounded-xl p-6">
      <h2 className="text-sm font-semibold text-foreground">Cobros de turno</h2>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Precio del turno</dt>
          <dd className="font-semibold text-foreground">{formatArs(priceSnapshot)}</dd>
        </div>
        {depositAmount > 0 && (
          <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              Seña{' '}
              {depositCounted > 0 ? (
                <span className="text-emerald-800 dark:text-emerald-400">✓ pagada</span>
              ) : (
                <span className="text-muted-foreground">
                  ({DEPOSIT_STATUS_LABELS[depositDisplayStatus] ?? depositDisplayStatus})
                </span>
              )}
            </dt>
            <dd className="text-foreground">{formatArs(depositAmount)}</dd>
          </div>
        )}
        {charges.map((c) => (
          <div key={c.id} className="flex items-center justify-between">
            <dt className="text-muted-foreground">
              Cobro · {(METHOD_LABELS as Record<string, string>)[c.method] ?? c.method}
              {c.description && c.description !== 'Cobro de turno' ? ` · ${c.description}` : ''}
            </dt>
            <dd className="text-foreground">{formatArs(c.amount)}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-2">
          <dt className="font-medium text-foreground">Pagado</dt>
          <dd className="font-semibold text-foreground">{formatArs(totalPaid)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="font-medium text-foreground">Saldo pendiente</dt>
          <dd
            className={`font-semibold ${isPaidInFull ? 'text-emerald-800 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-400'}`}
          >
            {isPaidInFull ? 'Pagado completo' : formatArs(pendingAmount)}
          </dd>
        </div>
      </dl>

      {!open ? (
        <button
          type="button"
          onClick={openForm}
          disabled={isPaidInFull}
          title={isPaidInFull ? 'Este turno ya está pagado por completo.' : undefined}
          className="mt-4 h-11 md:h-9 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-card px-4 text-sm font-semibold text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-card"
        >
          + Agregar cobro
        </button>
      ) : (
        <div className="mt-4 space-y-4 rounded-lg border border-border bg-muted/40 p-4">
          {/* Pestañas de modo de cobro */}
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <button
              type="button"
              onClick={() => {
                setChargeMode('single')
                setError(null)
              }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                chargeMode === 'single'
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              Pago único
            </button>
            <button
              type="button"
              onClick={() => {
                setChargeMode('split')
                setError(null)
              }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1',
                chargeMode === 'split'
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <span>⚡ Pago dividido (2 medios)</span>
            </button>
          </div>

          {chargeMode === 'single' ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <label htmlFor="charge-amount" className="text-xs font-medium text-foreground">
                      Monto (ARS)
                    </label>
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setAmountCents(Math.round(pendingAmount / 2))}
                        className="text-emerald-700 dark:text-emerald-400 hover:underline text-[11px]"
                      >
                        50%
                      </button>
                      <span className="text-muted-foreground">•</span>
                      <button
                        type="button"
                        onClick={() => setAmountCents(pendingAmount)}
                        className="text-emerald-700 dark:text-emerald-400 hover:underline text-[11px]"
                      >
                        Total
                      </button>
                    </div>
                  </div>
                  <MoneyInput
                    id="charge-amount"
                    minCents={1}
                    maxCents={pendingAmount}
                    valueCents={amountCents}
                    onValueChange={setAmountCents}
                  />
                  <p className="text-xs text-muted-foreground">
                    Máximo cobrable: {formatArs(pendingAmount)}
                  </p>
                </div>
                <div className="flex-1 space-y-1">
                  <label htmlFor="charge-method" className="text-xs font-medium text-foreground">
                    Medio de pago
                  </label>
                  <select
                    id="charge-method"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as typeof method)}
                    className="sr-only"
                  >
                    <option value="cash">Efectivo</option>
                    <option value="transfer">Transferencia</option>
                    <option value="mercadopago">MercadoPago</option>
                    <option value="other">Otro</option>
                  </select>

                  <Popover open={isMethodOpen} onOpenChange={setIsMethodOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="Medio de pago"
                        className="flex h-11 md:h-9 w-full items-center justify-between gap-2 rounded-xl border border-border/80 bg-background dark:bg-zinc-900/60 px-3.5 text-sm font-medium text-foreground transition-all hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500/40 shadow-xs cursor-pointer"
                      >
                        <div className="flex items-center gap-2 truncate">
                          {(() => {
                            const current =
                              PAYMENT_METHODS.find((m) => m.value === method) ?? PAYMENT_METHODS[0]
                            const Icon = current.icon
                            return (
                              <>
                                <Icon className={cn('h-4 w-4 shrink-0', current.accentClass)} />
                                <span className="font-semibold text-foreground">
                                  {current.label}
                                </span>
                              </>
                            )
                          })()}
                        </div>
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200',
                            isMethodOpen && 'rotate-180',
                          )}
                        />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="w-(--radix-popover-trigger-width) p-1.5 rounded-xl bg-card text-card-foreground border border-border/90 shadow-xl backdrop-blur-xl space-y-0.5 z-50"
                    >
                      {PAYMENT_METHODS.map((m) => {
                        const isSelected = method === m.value
                        const Icon = m.icon
                        return (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => {
                              setMethod(m.value)
                              setIsMethodOpen(false)
                            }}
                            className={cn(
                              'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer text-left',
                              isSelected
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold'
                                : 'hover:bg-accent text-foreground',
                            )}
                          >
                            <div className="flex items-center gap-2.5">
                              <Icon className={cn('h-4 w-4 shrink-0', m.accentClass)} />
                              <span>{m.label}</span>
                            </div>
                            {isSelected && (
                              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/90 italic">
                💡 Si pagaron con 2 medios (ej. parte Efectivo y parte Transferencia), podés usar la
                pestaña arriba <strong>&quot;⚡ Pago dividido&quot;</strong>.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-md bg-background/60 p-3 border border-border/60 space-y-3">
                <p className="text-xs font-semibold text-foreground">Primer pago</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="split-amount-1" className="text-xs font-medium text-foreground">
                      Monto 1 (ARS)
                    </label>
                    <MoneyInput
                      id="split-amount-1"
                      minCents={1}
                      maxCents={pendingAmount - 1}
                      valueCents={splitCents1}
                      onValueChange={setSplitCents1}
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="split-method-1" className="text-xs font-medium text-foreground">
                      Medio de pago 1
                    </label>
                    <select
                      id="split-method-1"
                      value={splitMethod1}
                      onChange={(e) => setSplitMethod1(e.target.value as typeof splitMethod1)}
                      className="sr-only"
                    >
                      <option value="cash">Efectivo</option>
                      <option value="transfer">Transferencia</option>
                      <option value="mercadopago">MercadoPago</option>
                      <option value="other">Otro</option>
                    </select>
                    <Popover open={isMethod1Open} onOpenChange={setIsMethod1Open}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-border/80 bg-background dark:bg-zinc-900/60 px-3.5 text-sm font-medium text-foreground transition-all hover:bg-accent focus-visible:outline-hidden cursor-pointer"
                        >
                          <span className="font-semibold text-foreground">
                            {METHOD_LABELS[splitMethod1]}
                          </span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-(--radix-popover-trigger-width) p-1.5 rounded-xl bg-card border border-border z-50"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => {
                              setSplitMethod1(m.value)
                              setIsMethod1Open(false)
                            }}
                            className={cn(
                              'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-left cursor-pointer',
                              splitMethod1 === m.value
                                ? 'bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300'
                                : 'hover:bg-accent',
                            )}
                          >
                            <span>{m.label}</span>
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-background/60 p-3 border border-border/60 space-y-3">
                <p className="text-xs font-semibold text-foreground">
                  Segundo pago (saldo restante)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="split-amount-2" className="text-xs font-medium text-foreground">
                      Monto 2 (ARS)
                    </label>
                    <MoneyInput id="split-amount-2" valueCents={splitCents2Value} disabled />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="split-method-2" className="text-xs font-medium text-foreground">
                      Medio de pago 2
                    </label>
                    <select
                      id="split-method-2"
                      value={splitMethod2}
                      onChange={(e) => setSplitMethod2(e.target.value as typeof splitMethod2)}
                      className="sr-only"
                    >
                      <option value="cash">Efectivo</option>
                      <option value="transfer">Transferencia</option>
                      <option value="mercadopago">MercadoPago</option>
                      <option value="other">Otro</option>
                    </select>
                    <Popover open={isMethod2Open} onOpenChange={setIsMethod2Open}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-border/80 bg-background dark:bg-zinc-900/60 px-3.5 text-sm font-medium text-foreground transition-all hover:bg-accent focus-visible:outline-hidden cursor-pointer"
                        >
                          <span className="font-semibold text-foreground">
                            {METHOD_LABELS[splitMethod2]}
                          </span>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        className="w-(--radix-popover-trigger-width) p-1.5 rounded-xl bg-card border border-border z-50"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <button
                            key={m.value}
                            type="button"
                            onClick={() => {
                              setSplitMethod2(m.value)
                              setIsMethod2Open(false)
                            }}
                            className={cn(
                              'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-left cursor-pointer',
                              splitMethod2 === m.value
                                ? 'bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-300'
                                : 'hover:bg-accent',
                            )}
                          >
                            <span>{m.label}</span>
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <span>
                  Resumen: {formatArs(splitCents1Value)} ({METHOD_LABELS[splitMethod1]}) +{' '}
                  {formatArs(splitCents2Value)} ({METHOD_LABELS[splitMethod2]})
                </span>
                <span className="font-semibold">
                  Total: {formatArs(splitCents1Value + splitCents2Value)}
                </span>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={pending}
              onClick={onSubmit}
              className="h-11 md:h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 cursor-pointer"
            >
              {chargeMode === 'split' ? 'Registrar cobro dividido' : 'Registrar cobro'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="h-11 md:h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
