import { MDXRemote } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'

const components = {
  // Aquí podemos mapear componentes personalizados, por ejemplo reemplazar <a> por <Link> de Next.js
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className="text-3xl font-bold mt-8 mb-4" {...props} />,
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => <h3 className="text-2xl font-semibold mt-6 mb-3" {...props} />,
}

export function Mdx({ source }: { source: string }) {
  return (
    <MDXRemote
      source={source}
      components={components}
      options={{
        mdxOptions: {
          remarkPlugins: [remarkGfm],
        },
      }}
    />
  )
}
