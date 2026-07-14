import { getAllPosts } from '@/lib/content/posts'
import Link from 'next/link'
import BusinessHeader from '@/components/site/BusinessHeader'

export const metadata = {
  title: 'Blog para Dueños de Complejos | TurnoGol',
  description: 'Estrategias, consejos y guías para gestionar mejor tu complejo de fútbol.',
}

export default async function BlogIndexPage() {
  const posts = await getAllPosts('blog')

  return (
    <div className="min-h-screen bg-gray-50">
      <BusinessHeader />
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl mb-8">
          Blog
        </h1>
        <div className="grid gap-8">
          {posts.map((post) => (
            <article key={post.slug} className="bg-white p-6 rounded-lg shadow-xs border border-gray-100">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                <Link href={`/blog/${post.slug}`} className="hover:text-blue-600">
                  {post.frontmatter.title}
                </Link>
              </h2>
              <p className="text-gray-500 mb-4">{post.frontmatter.description}</p>
              <div className="text-sm text-gray-400">
                {post.frontmatter.date}
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
