import { buttonVariants } from './src/components/ui/button.tsx'
import { cn } from './src/lib/utils.ts'

const custom = 'h-7 px-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
const merged = cn(buttonVariants({ variant: 'ghost', size: 'sm', className: custom }))
console.log('RESTABLECER:', merged)

const customPersonalizar = 'h-7 px-2 text-xs font-semibold text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
const mergedP = cn(buttonVariants({ variant: 'ghost', size: 'sm', className: customPersonalizar }))
console.log('PERSONALIZAR:', mergedP)
