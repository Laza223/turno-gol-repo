import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { PORTAL_BUTTON_OUTLINE, PORTAL_TITLE } from '@/components/world/PortalAuthFrame'
import { PortalWorld } from '@/components/world/PortalWorld'
import { cn } from '@/lib/utils'

export default function NotFound() {
  return (
    <PortalWorld>
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="max-w-sm space-y-4">
          <h1 className={PORTAL_TITLE}>Complejo no encontrado</h1>
          <p className="text-base text-muted-foreground">
            No encontramos este complejo. ¿Buscás otro?
          </p>
          <Link
            href="/"
            className={cn(
              buttonVariants({ variant: 'outline' }),
              PORTAL_BUTTON_OUTLINE,
              'sm:w-auto',
            )}
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    </PortalWorld>
  )
}
