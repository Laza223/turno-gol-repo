'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { TgBallSpinner } from '@/components/ui/tg-ball-spinner'
import { VenderContext } from '@/components/layout/vender-context'
import { useUnconfirmedDialogGuard } from '@/hooks/use-unconfirmed-dialog-guard'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'
import type { CreateTabAction, SellTicketAction } from '@/app/(admin)/caja/cantina/TicketPanel'
import type { VenderCatalogActionResult } from '@/app/(admin)/caja/cantina/actions'

// El modal viaja en un chunk aparte: el provider está en todas las pantallas del panel.
// Mientras llega se ve el mismo spinner que mientras llega el catálogo.
const VenderDialog = dynamic(() => import('./VenderDialog').then((m) => m.VenderDialog), {
  ssr: false,
  loading: () => <VenderLoading />,
})

function VenderLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
      <DialogTitle className="sr-only">Vender</DialogTitle>
      <TgBallSpinner size="sm" aria-label="Cargando productos" />
    </div>
  )
}

type Catalog = { products: CanteenProductRow[]; topProductIds: string[] }

/** Cuánto vale un catálogo cargado: el stock cambia durante el día, no se reusa para siempre. */
const CATALOG_TTL_MS = 60_000
/** Tras un error, apuntar el botón no reintenta: solo abrir o "Reintentar". */
const ERROR_COOLDOWN_MS = 30_000

/** Diálogos y menús desplegables abiertos (Radix, `modal={false}`: la V es su búsqueda por letra). */
const OPEN_OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

/** ¿El foco está en algo donde se escribe? Ahí la V es una letra, no un atajo. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Vender desde cualquier vista del panel: un modal grande (`VenderDialog`) que abre
 * el botón "Vender" del riel o de la barra superior de Hoy, o la tecla V (decisión
 * del dueño, 2026-10-26; antes solo se vendía desde Hoy).
 *
 * Vive en el layout, así que no puede traer el catálogo con la página: lo pide a
 * `loadCatalogAction` al abrir (o antes, si el botón lo anticipa con `prefetch`) y lo
 * reusa 60 s. Una venta lo descarta: el stock cambió.
 *
 * El modal se MONTA al abrirse: cada venta arranca limpia. Después de cobrar o de
 * anotar el fiado se cierra solo. No se cierra con una venta sin confirmar y tocar
 * afuera nunca cierra — ver `useUnconfirmedDialogGuard`. Las Server Actions llegan
 * por prop (una Server Component no puede pasarlas de otra forma a un componente
 * cliente).
 */
export function VenderProvider({
  loadCatalogAction,
  sellTicketAction,
  createTabAction,
  children,
}: {
  loadCatalogAction: () => Promise<VenderCatalogActionResult>
  sellTicketAction: SellTicketAction
  createTabAction: CreateTabAction
  children: ReactNode
}) {
  const [open, setOpenState] = useState(false)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadedAt = useRef(0)
  const inFlight = useRef(false)
  const failedAt = useRef(0)
  const guard = useUnconfirmedDialogGuard(setOpenState)

  const load = useCallback(() => {
    if (inFlight.current) return
    if (Date.now() - loadedAt.current < CATALOG_TTL_MS) return
    inFlight.current = true
    loadedAt.current = 0
    setCatalog(null)
    setLoadError(null)
    loadCatalogAction()
      .then((result) => {
        if (result.success) {
          loadedAt.current = Date.now()
          setCatalog({ products: result.products, topProductIds: result.topProductIds })
        } else {
          failedAt.current = Date.now()
          setLoadError(result.error)
        }
      })
      .catch(() => {
        failedAt.current = Date.now()
        setLoadError('No se pudieron cargar los productos. Probá de nuevo.')
      })
      .finally(() => {
        inFlight.current = false
      })
  }, [loadCatalogAction])

  // Lo que anticipan los botones al apuntarlos: no insiste sobre un error reciente.
  const prefetch = useCallback(() => {
    if (Date.now() - failedAt.current < ERROR_COOLDOWN_MS) return
    load()
  }, [load])

  const setOpen = useCallback(
    (next: boolean) => {
      if (next) load()
      setOpenState(next)
    },
    [load],
  )

  // La V abre la venta desde cualquier lado del panel, salvo escribiendo o con otro
  // diálogo o menú abierto (el cobro de un turno, un select): ahí no le puede robar la
  // pantalla.
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      // El autocompletado del navegador dispara keydown sin `key`, aunque el tipo diga string.
      if (e.key?.toLowerCase() !== 'v' || e.repeat) return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || isTyping(e.target)) return
      if (document.querySelector(OPEN_OVERLAY)) return
      e.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  const value = useMemo(() => ({ open, setOpen, prefetch }), [open, setOpen, prefetch])

  return (
    <VenderContext value={value}>
      {children}
      {open && (
        <Dialog open onOpenChange={guard.onOpenChange}>
          <DialogContent
            className="h-[calc(100dvh-2rem)] max-w-[1120px] grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden p-0 md:h-[min(640px,calc(100dvh-2rem))] md:max-h-none"
            onInteractOutside={guard.onInteractOutside}
          >
            {catalog ? (
              <VenderDialog
                products={catalog.products}
                topProductIds={catalog.topProductIds}
                sellTicketAction={sellTicketAction}
                createTabAction={createTabAction}
                onUnconfirmedChange={guard.onUnconfirmedChange}
                onSold={() => {
                  loadedAt.current = 0
                  setOpenState(false)
                }}
              />
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                <DialogTitle className="sr-only">Vender</DialogTitle>
                <p className="text-sm text-muted-foreground">{loadError}</p>
                <button
                  type="button"
                  onClick={load}
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  Reintentar
                </button>
              </div>
            ) : (
              <VenderLoading />
            )}
          </DialogContent>
        </Dialog>
      )}
    </VenderContext>
  )
}
