import { getAllPosts } from '@/lib/content/posts'
import Link from 'next/link'
import '@/components/site/article.css'

export const metadata = {
  title: 'Blog para dueños de complejos',
  description: 'Estrategias, consejos y guías para gestionar mejor tu complejo de fútbol.',
}

export default async function BlogIndexPage() {
  const posts = await getAllPosts('blog')

  return (
    <div className="ar-page">
      <div className="bz-wrap grid gap-8">
        <header>
          <h1 className="ar-h1">Blog</h1>
          <p className="ar-sub">{metadata.description}</p>
        </header>
        <div className="ar-posts">
          {posts.map((post) => (
            <article key={post.slug} className="ar-post glass-painted">
              <time>{post.frontmatter.date}</time>
              <h2>
                <Link href={`/blog/${post.slug}`}>{post.frontmatter.title}</Link>
              </h2>
              <p>{post.frontmatter.description}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
