import { cn } from '@/lib/utils'

interface LogoMarkProps {
  className?: string
  /** Color de la T (`currentColor` por default: sigue al texto del contenedor). */
  markClassName?: string
  /** Color de la G. Default: el verde menta del isotipo original. */
  accentClassName?: string
}

/**
 * Isotipo de TurnoGol (la T y la G anguladas). Es la forma original de
 * `public/logo.png` vectorizada: no reemplazar por texto "TG" en una fuente.
 * Sobre fondo claro la T debe ser oscura (`text-slate-950`); sobre navy, blanca.
 */
export function LogoMark({
  className,
  markClassName = 'text-white',
  accentClassName = 'fill-[#1de9b0]',
}: LogoMarkProps) {
  return (
    <svg
      viewBox="240 385 795 490"
      role="img"
      aria-label="TurnoGol"
      className={cn('h-6 w-auto', markClassName, className)}
    >
      <path
        className="fill-current"
        d="M345 389H967L871 499H590C570 503 556 515 545 535L430 780C415 818 395 830 372 834L245 870L425 499H246Z"
      />
      <path
        className={accentClassName}
        d="M580 565C592 540 620 525 657 525H1030L953 621H710C690 621 675 632 665 650L605 755C600 768 608 777 622 777H765C775 777 780 772 784 764L788 744H667L740 655H965L877 822C862 850 835 866 800 866H388C428 855 452 832 462 805Z"
      />
    </svg>
  )
}
