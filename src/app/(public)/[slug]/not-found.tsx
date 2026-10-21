import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { PORTAL_BUTTON_OUTLINE } from '@/components/world/PortalAuthFrame'
import { cn } from '@/lib/utils'
import { PROFILE_TITLE } from './components/styles'

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-sm space-y-4">
        <h1 className={PROFILE_TITLE}>Complejo no encontrado</h1>
        <p className="text-base text-muted-foreground">
          No encontramos este complejo. ¿Buscás otro?
        </p>
        <Link
          href="/"
          className={cn(buttonVariants({ variant: 'outline' }), PORTAL_BUTTON_OUTLINE, 'sm:w-auto')}
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
