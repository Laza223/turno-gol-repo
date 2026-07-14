import { getPostBySlug, getAllPosts } from '@/lib/content/posts'
import { ArticleShell } from '@/components/site/ArticleShell'
import { Mdx } from '@/components/site/Mdx'
import { notFound } from 'next/navigation'
import BusinessHeader from '@/components/site/BusinessHeader'
import type { Metadata } from 'next'

export async function generateStaticParams() {
  const posts = await getAllPosts('blog')
  return posts.map((post) => ({
    slug: post.slug,
  }))
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const post = await getPostBySlug(params.slug, 'blog')
  if (!post) return {}

  return {
    title: `${post.frontmatter.title} | TurnoGol`,
    description: post.frontmatter.description,
  }
}

export default async function BlogPostPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const post = await getPostBySlug(params.slug, 'blog')

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
          date={post.frontmatter.date}
        >
          <Mdx source={post.content} />
        </ArticleShell>
      </main>
    </div>
  )
}
