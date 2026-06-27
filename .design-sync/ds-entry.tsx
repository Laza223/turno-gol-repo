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
