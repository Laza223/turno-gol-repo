import { getPostBySlug } from '@/lib/content/posts'
import { ArticleShell } from '@/components/site/ArticleShell'
import { Mdx } from '@/components/site/Mdx'
import { notFound } from 'next/navigation'
import BusinessHeader from '@/components/site/BusinessHeader'
import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const post = await getPostBySlug('vs-alquila-tu-cancha', 'pages')
  if (!post) return {}

  return {
    title: `${post.frontmatter.title} | TurnoGol`,
    description: post.frontmatter.description,
  }
}

export default async function VsAlquilaTuCanchaPage() {
  const post = await getPostBySlug('vs-alquila-tu-cancha', 'pages')

  if (!post) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <BusinessHeader />
      <main>
        <ArticleShell
          title={post.frontmatter.title}
          description={post.frontmatter.description}
          addFaqSchema={true}
        >
          <Mdx source={post.content} />
        </ArticleShell>
      </main>
    </div>
  )
}
