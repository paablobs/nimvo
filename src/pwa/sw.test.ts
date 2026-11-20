import { describe, expect, it, vi } from 'vitest'

import template from './sw.template.js?raw'
import { renderServiceWorker } from './precache.ts'


type Listener = (event: unknown) => void

/** Runs the generated worker in a minimal service-worker-like scope. */
function loadWorker(version: string, existingCaches: Record<string, Map<string, string>> = {}) {
  const listeners = new Map<string, Listener>()
  const stores = new Map<string, Map<string, string>>(Object.entries(existingCaches))
  const fetched: string[] = []
  const matchOptions: ({ ignoreVary?: boolean } | undefined)[] = []
  const fakeCaches = {
    keys: async () => [...stores.keys()],
    delete: async (key: string) => stores.delete(key),
    match: async (request: string | { url: string }, options?: { ignoreVary?: boolean }) => {
      matchOptions.push(options)
      const url = typeof request === 'string' ? request : request.url
      for (const store of stores.values()) if (store.has(url)) return store.get(url)
      return undefined
    },
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, string>()
      stores.set(name, store)
      return {
        match: async (request: string | { url: string }, options?: { ignoreVary?: boolean }) => {
          matchOptions.push(options)
          return store.get(typeof request === 'string' ? request : request.url)
        },
        addAll: async (requests: { url: string }[]) => { for (const request of requests) store.set(request.url, `cached:${request.url}`) },
      }
    },
  }
  const self = {
    registration: { scope: 'https://example.test/nimvo/' },
    location: { origin: 'https://example.test' },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  }
  class FakeRequest { url: string; constructor(url: string) { this.url = url } }
  const fakeFetch = async (request: { url: string }) => { fetched.push(request.url); return `network:${request.url}` }
  // Run the generated worker with only the globals a service worker would see.
  new Function('self', 'caches', 'URL', 'Request', 'fetch', renderServiceWorker(template, ['index.html', 'assets/app.js'], version))(self, fakeCaches, URL, FakeRequest, fakeFetch)
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve()
    listeners.get(type)?.({ ...event, waitUntil: (promise: Promise<unknown>) => { pending = promise }, respondWith: (promise: Promise<unknown>) => { pending = Promise.resolve(promise) } })
    return pending
  }
  return { self, stores, fetched, matchOptions, dispatch, listeners }
}

describe('service worker', () => {
  it('precaches the shell and assets on install without skipping the waiting phase', async () => {
    const worker = loadWorker('000000000001-aaaaaaaaaaaaaaaa')
    await worker.dispatch('install', {})
    expect([...worker.stores.get('nimvo-precache-000000000001-aaaaaaaaaaaaaaaa')!.keys()]).toEqual([
      'https://example.test/nimvo/index.html', 'https://example.test/nimvo/assets/app.js',
    ])
    expect(worker.self.skipWaiting).not.toHaveBeenCalled()
  })

  it('only skips waiting when the page asks for it', async () => {
    const worker = loadWorker('000000000001-aaaaaaaaaaaaaaaa')
    await worker.dispatch('message', { data: { type: 'OTHER' } })
    expect(worker.self.skipWaiting).not.toHaveBeenCalled()
    await worker.dispatch('message', { data: { type: 'SKIP_WAITING' } })
    expect(worker.self.skipWaiting).toHaveBeenCalledOnce()
  })

  it('keeps the current and newest previous Nimvo cache on activate, removing older and keeping unrelated ones', async () => {
    const worker = loadWorker('000000000003-bbbbbbbbbbbbbbbb', {
      'nimvo-precache-000000000001-1111111111111111': new Map(),
      'nimvo-precache-000000000002-2222222222222222': new Map(),
      'nimvo-precache-000000000003-bbbbbbbbbbbbbbbb': new Map(),
      'other-app': new Map(),
    })
    await worker.dispatch('activate', {})
    expect([...worker.stores.keys()].sort()).toEqual([
      'nimvo-precache-000000000002-2222222222222222', 'nimvo-precache-000000000003-bbbbbbbbbbbbbbbb', 'other-app',
    ])
    expect(worker.self.clients.claim).toHaveBeenCalled()
  })

  it('still serves files from the previous version for tabs running older code', async () => {
    const worker = loadWorker('000000000004-cccccccccccccccc', {
      'nimvo-precache-000000000003-bbbbbbbbbbbbbbbb': new Map([['https://example.test/nimvo/assets/HistoryPage-old.js', 'old-chunk']]),
    })
    await worker.dispatch('install', {})
    const response = await worker.dispatch('fetch', { request: { method: 'GET', url: 'https://example.test/nimvo/assets/HistoryPage-old.js', mode: 'cors' } })
    expect(response).toBe('old-chunk')
    expect(worker.fetched).toEqual([])
  })

  it('serves the cached shell for SPA routes and cached assets, falling back to the network', async () => {
    const worker = loadWorker('000000000004-cccccccccccccccc')
    await worker.dispatch('install', {})
    const get = (url: string, mode = 'cors') => worker.dispatch('fetch', { request: { method: 'GET', url, mode } })
    expect(await get('https://example.test/nimvo/boveda/historial', 'navigate')).toBe('cached:https://example.test/nimvo/index.html')
    expect(await get('https://example.test/nimvo/assets/app.js')).toBe('cached:https://example.test/nimvo/assets/app.js')
    expect(await get('https://example.test/nimvo/assets/uncached.js')).toBe('network:https://example.test/nimvo/assets/uncached.js')
    // Responses with a Vary header must still match CORS-mode script and font requests.
    expect(worker.matchOptions.length).toBeGreaterThanOrEqual(3)
    expect(worker.matchOptions.every((options) => options?.ignoreVary === true)).toBe(true)
  })

  it('does not intercept non-GET, cross-origin, out-of-scope or non-route navigations', async () => {
    const worker = loadWorker('000000000005-dddddddddddddddd')
    await worker.dispatch('install', {})
    const responses: unknown[] = []
    const run = (request: Record<string, unknown>) => {
      let intercepted = false
      worker.listeners.get('fetch')?.({ request, respondWith: () => { intercepted = true } })
      responses.push(intercepted)
    }
    run({ method: 'POST', url: 'https://example.test/nimvo/', mode: 'cors' })
    run({ method: 'GET', url: 'https://cdn.example.net/nimvo/x.js', mode: 'cors' })
    run({ method: 'GET', url: 'https://example.test/other/x.js', mode: 'cors' })
    run({ method: 'GET', url: 'https://example.test/nimvo/robots.txt', mode: 'navigate' })
    expect(responses).toEqual([false, false, false, false])
  })
})
