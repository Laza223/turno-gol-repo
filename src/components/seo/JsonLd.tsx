import { renderStructuredData, type StructuredData } from '@/lib/seo/structured-data'

export default function JsonLd({ data }: { data: StructuredData }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: renderStructuredData(data) }}
    />
  )
}
