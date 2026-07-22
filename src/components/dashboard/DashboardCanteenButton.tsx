'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingBag } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  CanteenQuickSale,
  type SellTicketAction,
} from '@/app/(admin)/caja/components/CanteenQuickSale'
import type { CanteenProductRow } from '@/modules/canteen/canteen.types'

export function DashboardCanteenButton({
  products,
  sellTicketAction,
}: {
  products: CanteenProductRow[]
  sellTicketAction: SellTicketAction
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const handleConfigureClick = () => {
    setOpen(false)
    router.push('/caja/productos?configureCanteen=true')
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:bg-emerald-600 dark:hover:bg-emerald-500"
        >
          <ShoppingBag className="h-4 w-4" aria-hidden="true" />
          Venta rápida
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md p-2">
        <DialogHeader className="sr-only">
          <DialogTitle>Venta rápida de cantina</DialogTitle>
        </DialogHeader>
        <CanteenQuickSale
          products={products}
          sellTicketAction={sellTicketAction}
          onConfigureClick={handleConfigureClick}
          isInDialog
        />
      </DialogContent>
    </Dialog>
  )
}
