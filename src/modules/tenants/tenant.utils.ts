export function generateSlug(name: string): string {
  const result = name
    .normalize('NFD')
    .replace(/̀-ͯ/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return result || 'complejo'
}
