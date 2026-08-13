import { describe, expect, it } from 'vitest'
import { getPostBySlug } from '@/lib/content/posts'

// Security scan F20/F22: getPostBySlug concatenated the route slug straight
// into a filesystem path with no validation. path.join normalizes `..`
// segments instead of rejecting them, so an unvalidated slug could escape
// content/blog/ and read any .mdx file elsewhere on the filesystem.
describe('getPostBySlug — traversal guard (F20/F22)', () => {
  it('rejects a slug containing ../ traversal segments', () => {
    expect(getPostBySlug('../../package')).toBeNull()
  })
  it('rejects a slug containing a path separator', () => {
    expect(getPostBySlug('foo/bar')).toBeNull()
  })
  it('rejects a slug containing a backslash', () => {
    expect(getPostBySlug('foo\\bar')).toBeNull()
  })
  it('rejects an absolute-path-shaped slug', () => {
    expect(getPostBySlug('/etc/passwd')).toBeNull()
  })
  it('rejects a slug with uppercase or special characters (only [a-z0-9-] allowed)', () => {
    expect(getPostBySlug('Foo_Bar!')).toBeNull()
  })
  it('rejects an empty slug', () => {
    expect(getPostBySlug('')).toBeNull()
  })
  it('returns null (not a throw) for a well-formed but nonexistent slug', () => {
    expect(getPostBySlug('this-post-does-not-exist-xyz')).toBeNull()
  })
})
