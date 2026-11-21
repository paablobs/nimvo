/** Files that must never be precached: the worker itself, SPA fallback, SEO files and source maps. */
const EXCLUDED = [/^sw\.js$/, /^404\.html$/, /^robots\.txt$/, /^sitemap\.xml$/, /^og-image\./, /\.map$/]

/** Returns the sorted list of build output files (relative POSIX paths) to precache. */
export function selectPrecacheFiles(files: readonly string[]): string[] {
  const selected = files
    .map((file) => file.replaceAll('\\', '/').replace(/^\.?\//, ''))
    .filter((file) => file.length > 0 && !EXCLUDED.some((pattern) => pattern.test(file)))
  if (!selected.includes('index.html')) throw new Error('index.html must be part of the precache list')
  return [...new Set(selected)].sort()
}

/**
 * Fills the service worker template with the precache version and file list.
 * The version is a 16 hex digit hash of the precached content only, so
 * rebuilding unchanged output yields an identical worker and no update prompt.
 */
export function renderServiceWorker(template: string, files: readonly string[], version: string): string {
  if (!/^[a-f0-9]{16}$/.test(version)) throw new Error('Invalid precache version')
  const versionToken = "'__PRECACHE_VERSION__'"
  const filesToken = "['__PRECACHE_FILES__']"
  if (!template.includes(versionToken) || !template.includes(filesToken)) {
    throw new Error('Service worker template is missing its placeholders')
  }
  return template
    .replace(versionToken, () => JSON.stringify(version))
    .replace(filesToken, () => JSON.stringify(files))
}
