import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'

// Sin componentes propios: los títulos, párrafos, listas y tablas los viste `.ar-prose`
// (`article.css`). Una utilidad acá (`text-3xl`) le ganaría a esa clase.
export function Mdx({ source }: { source: string }) {
  return (
    <MDXRemote
      source={source}
      options={{
        mdxOptions: {
          remarkPlugins: [remarkGfm],
        },
      }}
    />
  )
}
