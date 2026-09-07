import Link from 'next/link'

/**
 * Salida de `/suspended` y `/reactivar` para el staff que trabaja en más de un
 * complejo.
 *
 * Desde que los guards honran el complejo elegido en `/select-tenant` (AUD-01),
 * elegir uno bloqueado lleva a esas dos pantallas — que es lo correcto: es el
 * que se pidió. Pero eran un callejón sin salida: para volver al complejo que sí
 * opera había que escribir `/select-tenant` a mano. Antes no se notaba porque el
 * panel resolvía por la membresía más antigua e ignoraba la elección.
 *
 * Quién decide si se muestra es la página, que ya tiene la sesión a mano: con un
 * solo complejo `/select-tenant` es una lista de un elemento y el link sería
 * ruido para la enorme mayoría de los dueños.
 */
export function SwitchTenantLink() {
  return (
    <Link
      href="/select-tenant"
      className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground hover:text-foreground md:min-h-0"
    >
      Cambiar de complejo
    </Link>
  )
}
