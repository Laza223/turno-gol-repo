import type { ReactNode } from 'react'
import { MessageCircle } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { contactWhatsappUrl } from '@/lib/contact'
import { cn } from '@/lib/utils'
import './article.css'

interface ArticleShellProps {
  children: ReactNode
  title: string
  description: string
  date?: string
  addFaqSchema?: boolean
}

/**
 * Notas del blog y comparativas, en vidrio (F8, `articulo.html` del mockup): la fecha arriba del
 * título, el cuerpo en un vidrio pintado y el cierre con la salida a WhatsApp en otro.
 */
export function ArticleShell({
  children,
  title,
  description,
  date,
  addFaqSchema: _addFaqSchema,
}: ArticleShellProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: description,
    ...(date && { datePublished: date }),
    author: {
      '@type': 'Organization',
      name: 'TurnoGol',
    },
  }

  // Si quisiéramos inyectar FAQPage Schema, se haría aquí combinando con el frontmatter/MDX.

  return (
    <article className="ar-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="ar-col">
        <header>
          {date && <p className="ar-eyebrow">{date}</p>}
          <h1 className="ar-h1">{title}</h1>
          <p className="ar-sub">{description}</p>
        </header>
        <div className="ar-prose glass-painted">{children}</div>
        <div className="ar-cta glass-painted">
          <h2>¿Listo para probar un sistema que sí funciona?</h2>
          <p>
            TurnoGol está diseñado específicamente para canchas de fútbol. Sin contratos, 30 días
            gratis.
          </p>
          <a
            href={contactWhatsappUrl('Hola! Quiero saber más sobre TurnoGol para mi complejo.')}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: 'pill', size: 'pill' }), 'mt-1')}
          >
            <MessageCircle className="size-4.5" aria-hidden />
            Contactanos por WhatsApp
          </a>
        </div>
      </div>
    </article>
  )
}
