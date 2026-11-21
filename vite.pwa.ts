import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

import { renderServiceWorker, selectPrecacheFiles } from './src/pwa/precache.ts'

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : Promise.resolve([path])
  }))
  return nested.flat()
}

/**
 * Writes dist/sw.js with a precache list of the final build output. The cache
 * version is a content hash of every precached file: any change invalidates the
 * old cache and an unchanged build produces a byte-identical worker.
 */
export function precacheServiceWorker(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'nimvo-precache-service-worker',
    apply: 'build',
    configResolved(resolved) { config = resolved },
    async closeBundle() {
      if (config.build.ssr) return
      const outDir = join(config.root, config.build.outDir)
      const all = (await walk(outDir)).map((path) => relative(outDir, path))
      const files = selectPrecacheFiles(all)
      const hash = createHash('sha256')
      for (const file of files) {
        hash.update(file)
        hash.update(await readFile(join(outDir, file)))
      }
      const template = await readFile(join(config.root, 'src/pwa/sw.template.js'), 'utf8')
      await writeFile(join(outDir, 'sw.js'), renderServiceWorker(template, files, hash.digest('hex').slice(0, 16)))
    },
  }
}
