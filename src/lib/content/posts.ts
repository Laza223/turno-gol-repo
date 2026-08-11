import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { z } from 'zod'

const frontmatterSchema = z.object({
  title: z.string(),
  description: z.string(),
  date: z.string(),
  author: z.string().optional(),
})

type Frontmatter = z.infer<typeof frontmatterSchema>

export interface MdxPost {
  slug: string
  content: string
  frontmatter: Frontmatter
}

export function getPostBySlug(slug: string, type: 'blog' | 'pages' = 'blog'): MdxPost | null {
  try {
    const fullPath = path.join(process.cwd(), 'content', type, `${slug}.mdx`)
    const fileContents = fs.readFileSync(fullPath, 'utf8')
    const { data, content } = matter(fileContents)

    return {
      slug,
      content,
      frontmatter: frontmatterSchema.parse(data),
    }
  } catch {
    return null
  }
}

export function getAllPosts(type: 'blog' | 'pages' = 'blog'): MdxPost[] {
  try {
    const contentDir = path.join(process.cwd(), 'content', type)
    const files = fs.readdirSync(contentDir)

    return files
      .filter((file) => file.endsWith('.mdx'))
      .map((file) => {
        const slug = file.replace(/\.mdx$/, '')
        return getPostBySlug(slug, type)
      })
      .filter((post): post is MdxPost => post !== null)
      .sort(
        (a, b) => new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime(),
      )
  } catch {
    return []
  }
}

// Aliases para sitemap.ts
export function listBlogPosts() {
  return getAllPosts('blog')
}

export function getContentPage(slug: string) {
  return getPostBySlug(slug, 'pages')
}

export function lastModified(post: MdxPost): Date {
  return new Date(post.frontmatter.date)
}
