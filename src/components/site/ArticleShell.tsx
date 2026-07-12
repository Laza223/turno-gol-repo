import type { ReactNode } from 'react'

interface ArticleShellProps {
  children: ReactNode
  title: string
  description: string
  date?: string
  addFaqSchema?: boolean
}

export function ArticleShell({ children, title, description, date, addFaqSchema: _addFaqSchema }: ArticleShellProps) {
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
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="mb-10 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">{title}</h1>
        <p className="mt-4 text-xl text-gray-500">{description}</p>
        {date && <p className="mt-2 text-sm text-gray-400">{date}</p>}
      </header>
      <div className="prose prose-lg prose-blue mx-auto">
        {children}
      </div>
      <div className="mt-16 text-center border-t border-gray-200 pt-10">
        <h2 className="text-2xl font-bold text-gray-900">¿Listo para probar un sistema que sí funciona?</h2>
        <p className="mt-4 text-lg text-gray-500">
          TurnoGol está diseñado específicamente para canchas de fútbol. Sin contratos, 30 días gratis.
        </p>
        <a
          href="https://wa.me/5491100000000"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-md bg-blue-600 px-8 py-3 text-lg font-medium text-white hover:bg-blue-700"
        >
          Contactanos por WhatsApp
        </a>
      </div>
    </article>
  )
}
