import { describe, expect, it } from 'vitest'

import template from './sw.template.js?raw'
import { renderServiceWorker, selectPrecacheFiles } from './precache.ts'


describe('selectPrecacheFiles', () => {
  it('keeps the app shell, assets, fonts and icons and drops non-app files', () => {
    expect(selectPrecacheFiles([
      'index.html', '404.html', 'sw.js', 'robots.txt', 'sitemap.xml', 'og-image.png', 'og-image.svg',
      'assets/index-abc.js', 'assets/index-abc.js.map', 'assets/sql-wasm-x.wasm', 'fonts/lexend.woff2',
      'icons/icon-192.png', 'manifest.webmanifest',
    ])).toEqual([
      'assets/index-abc.js', 'assets/sql-wasm-x.wasm', 'fonts/lexend.woff2', 'icons/icon-192.png', 'index.html', 'manifest.webmanifest',
    ])
  })

  it('normalizes Windows separators and duplicates', () => {
    expect(selectPrecacheFiles(['index.html', 'assets\\a.js', './assets/a.js'])).toEqual(['assets/a.js', 'index.html'])
  })

  it('fails when the app shell is missing', () => {
    expect(() => selectPrecacheFiles(['assets/a.js'])).toThrow('index.html')
  })
})

describe('renderServiceWorker', () => {
  it('embeds the version and file list as data, not code', () => {
    const output = renderServiceWorker(template, ['index.html', "assets/it's$&.js"], '0123456789ab-abcdef0123456789')
    expect(output).toContain('const PRECACHE_VERSION = "0123456789ab-abcdef0123456789"')
    expect(output).toContain('const PRECACHE_FILES = ["index.html","assets/it\'s$&.js"]')
    expect(output).not.toContain('__PRECACHE')
  })

  it('rejects an unexpected version and templates without placeholders', () => {
    expect(() => renderServiceWorker(template, ['index.html'], "'; alert(1)//")).toThrow('Invalid precache version')
    expect(() => renderServiceWorker('const x = 1', ['index.html'], '0123456789ab-abcdef0123456789')).toThrow('placeholders')
  })
})
