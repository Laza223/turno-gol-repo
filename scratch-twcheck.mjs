import { twMerge } from 'tailwind-merge'
import { clsx } from 'clsx'

const base = 'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'
const ghost = 'text-foreground hover:bg-accent hover:text-accent-foreground'
const sm = 'h-10 rounded-md px-3 md:h-9'
const custom = 'h-7 px-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'

const merged = twMerge(clsx([base, ghost, sm, custom]))
console.log(merged)
