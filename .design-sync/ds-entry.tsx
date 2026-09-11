// Barrel entry for the design-sync bundle. Names every export the previews and
// the design agent reach for — including Combobox's default export and the
// Dialog/DropdownMenu/Toast sub-parts (so compositions resolve). Pre-compiled to
// ESM by build-dist.mjs (jsx: automatic), then re-bundled to the IIFE global.
export { Button, buttonVariants } from '@/components/ui/button'
export type { ButtonProps } from '@/components/ui/button'

export { Badge, badgeVariants } from '@/components/ui/badge'
export type { BadgeProps } from '@/components/ui/badge'

export { Input } from '@/components/ui/input'
export type { InputProps } from '@/components/ui/input'

export { Label } from '@/components/ui/label'
export type { LabelProps } from '@/components/ui/label'

export { Skeleton } from '@/components/ui/skeleton'
export type { SkeletonProps } from '@/components/ui/skeleton'

export { Logo } from '@/components/ui/logo'

export { EmptyState } from '@/components/ui/empty-state'
export type { EmptyStateProps } from '@/components/ui/empty-state'

export { ErrorState } from '@/components/ui/error-state'
export type { ErrorStateProps, ErrorStateVariant } from '@/components/ui/error-state'

export { SubmitButton } from '@/components/ui/submit-button'

export { ConfirmDialog } from '@/components/ui/confirm-dialog'
export type { ConfirmDialogProps } from '@/components/ui/confirm-dialog'

export { default as Combobox } from '@/components/ui/combobox'
export type { ComboboxOption } from '@/components/ui/combobox'

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog'

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

export {
  Toast,
  ToastProvider,
  ToastViewport,
  ToastTitle,
  ToastDescription,
  ToastClose,
} from '@/components/ui/toast'
export type { ToastProps } from '@/components/ui/toast'

export { Toaster } from '@/components/ui/toaster'

// --- Ampliación 2026-09-11 -------------------------------------------------
// Las primitivas que las tres pantallas del rediseño (Hoy, Grilla y
// Configuración) usan de verdad, medidas con un grep de sus imports, más las
// dos compuestas que llevan TODAS las pantallas del panel (PageHeader y
// StatCard). Sin esto el agente de diseño no tiene el panel lateral del turno,
// las pestañas de Configuración ni la píldora de estado, y los dibuja a su
// gusto — que es exactamente la incoherencia que la auditoría acaba de cerrar.

export { StatusBadge } from '@/components/ui/status-badge'
export type { StatusBadgeVisual } from '@/components/ui/status-badge'

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

export { ScrollTabs } from '@/components/ui/scroll-tabs'
export type { ScrollTab } from '@/components/ui/scroll-tabs'

export { SegmentedControl } from '@/components/ui/segmented-control'
export type { SegmentedControlOption } from '@/components/ui/segmented-control'

export { RadioChipGroup, RadioChip } from '@/components/ui/radio-chip'

export { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'

export {
  Popover,
  PopoverTrigger,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
} from '@/components/ui/popover'

export { MoneyInput } from '@/components/ui/money-input'

export { PhoneInput } from '@/components/ui/phone-input'

export { ImageUploader } from '@/components/ui/image-uploader'

export { Coachmark } from '@/components/ui/coachmark'

export { ResponsiveList } from '@/components/ui/responsive-list'

export { TgBallSpinner } from '@/components/ui/tg-ball-spinner'

export { PageHeader } from '@/components/admin/PageHeader'

export { StatCard } from '@/components/admin/StatCard'
