import { describe, expect, it, vi } from 'vitest'

import template from './sw.template.js?raw'
import { renderServiceWorker } from './precache.ts'

type Listener = (event: unknown) => void

const ORIGIN = 'https://example.test/nimvo/'
const MARKER = `${ORIGIN}__nimvo_installed_at`

class FakeResponse {
  body: string
  constructor(body: string) { this.body = body }
  text = async () => this.body
}

type Store = Map<string, string | FakeResponse>

/** A cache holding the install marker the worker writes, for tests that start with existing caches. */
const installedCache = (installedAt: number, files: Record<string, string> = {}): Store =>
  new Map<string, string | FakeResponse>([[MARKER, new FakeResponse(String(installedAt))], ...Object.entries(files)])

/** Runs the generated worker in a minimal service-worker-like scope. */
function loadWorker(version: string, existingCaches: Record<string, Store> = {}) {
  const listeners = new Map<string, Listener>()
  const stores = new Map<string, Store>(Object.entries(existingCaches))
  const fetched: string[] = []
  const matchOptions: ({ ignoreVary?: boolean } | undefined)[] = []
  const matchIn = (store: Store, request: string | { url: string }, options?: { ignoreVary?: boolean }) => {
    matchOptions.push(options)
    return store.get(typeof request === 'string' ? request : request.url)
  }
  const fakeCaches = {
    keys: async () => [...stores.keys()],
    delete: async (key: string) => stores.delete(key),
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, string | FakeResponse>()
      stores.set(name, store)
      return {
        match: async (request: string | { url: string }, options?: { ignoreVary?: boolean }) => matchIn(store, request, options),
        put: async (request: string, response: FakeResponse) => { store.set(request, response) },
        addAll: async (requests: { url: string }[]) => { for (const request of requests) store.set(request.url, `cached:${request.url}`) },
      }
    },
  }
  const self = {
    registration: { scope: ORIGIN },
    location: { origin: 'https://example.test' },
    clients: { claim: vi.fn(async () => undefined) },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  }
  class FakeRequest { url: string; constructor(url: string) { this.url = url } }
  const fakeFetch = async (request: { url: string }) => { fetched.push(request.url); return `network:${request.url}` }
  // Run the generated worker with only the globals a service worker would see.
  new Function('self', 'caches', 'URL', 'Request', 'Response', 'fetch', renderServiceWorker(template, ['index.html', 'assets/app.js'], version))(self, fakeCaches, URL, FakeRequest, FakeResponse, fakeFetch)
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve()
    listeners.get(type)?.({ ...event, waitUntil: (promise: Promise<unknown>) => { pending = promise }, respondWith: (promise: Promise<unknown>) => { pending = Promise.resolve(promise) } })
    return pending
  }
  return { self, stores, fetched, matchOptions, dispatch, listeners }
}

const V1 = 'aaaaaaaaaaaaaaaa'
const V2 = 'bbbbbbbbbbbbbbbb'
const V3 = 'cccccccccccccccc'

describe('service worker', () => {
  it('precaches the shell and assets on install, stamps the cache, and does not skip waiting', async () => {
    const worker = loadWorker(V1)
    await worker.dispatch('install', {})
    const cache = worker.stores.get(`nimvo-precache-${V1}`)!
    expect([...cache.keys()]).toEqual([`${ORIGIN}index.html`, `${ORIGIN}assets/app.js`, MARKER])
    expect(Number(((cache.get(MARKER) as FakeResponse).body))).toBeGreaterThan(0)
    expect(worker.self.skipWaiting).not.toHaveBeenCalled()
  })

  it('only skips waiting when the page asks for it', async () => {
    const worker = loadWorker(V1)
    await worker.dispatch('message', { data: { type: 'OTHER' } })
    expect(worker.self.skipWaiting).not.toHaveBeenCalled()
    await worker.dispatch('message', { data: { type: 'SKIP_WAITING' } })
    expect(worker.self.skipWaiting).toHaveBeenCalledOnce()
  })

  it('keeps the current and the most recently installed previous Nimvo cache, removing older ones and keeping other apps', async () => {
    const worker = loadWorker(V3, {
      'nimvo-precache-oldest': installedCache(100),
      'nimvo-precache-newest-previous': installedCache(300),
      'nimvo-precache-middle': installedCache(200),
      [`nimvo-precache-${V3}`]: installedCache(400),
      'other-app': new Map(),
    })
    await worker.dispatch('activate', {})
    expect([...worker.stores.keys()].sort()).toEqual([`nimvo-precache-${V3}`, 'nimvo-precache-newest-previous', 'other-app'])
    expect(worker.self.clients.claim).toHaveBeenCalled()
  })

  it('still serves files from the previous version for tabs running older code', async () => {
    const worker = loadWorker(V3, {
      [`nimvo-precache-${V2}`]: installedCache(100, { [`${ORIGIN}assets/HistoryPage-old.js`]: 'old-chunk' }),
    })
    await worker.dispatch('install', {})
    const response = await worker.dispatch('fetch', { request: { method: 'GET', url: `${ORIGIN}assets/HistoryPage-old.js`, mode: 'cors' } })
    expect(response).toBe('old-chunk')
    expect(worker.fetched).toEqual([])
  })

  it("never serves another app's cache entries from the same origin", async () => {
    const worker = loadWorker(V3, { 'other-app-cache': new Map([[`${ORIGIN}assets/foreign.js`, 'foreign']]) })
    await worker.dispatch('install', {})
    const response = await worker.dispatch('fetch', { request: { method: 'GET', url: `${ORIGIN}assets/foreign.js`, mode: 'cors' } })
    expect(response).toBe(`network:${ORIGIN}assets/foreign.js`)
  })

  it('serves the cached shell for SPA routes and cached assets, falling back to the network', async () => {
    const worker = loadWorker(V3)
    await worker.dispatch('install', {})
    const get = (url: string, mode = 'cors') => worker.dispatch('fetch', { request: { method: 'GET', url, mode } })
    expect(await get(`${ORIGIN}boveda/historial`, 'navigate')).toBe(`cached:${ORIGIN}index.html`)
    expect(await get(`${ORIGIN}assets/app.js`)).toBe(`cached:${ORIGIN}assets/app.js`)
    expect(await get(`${ORIGIN}assets/uncached.js`)).toBe(`network:${ORIGIN}assets/uncached.js`)
    // Responses with a Vary header must still match CORS-mode script and font requests.
    expect(worker.matchOptions.length).toBeGreaterThanOrEqual(3)
    expect(worker.matchOptions.filter((options) => options !== undefined).every((options) => options?.ignoreVary === true)).toBe(true)
  })

  it('does not intercept non-GET, cross-origin, out-of-scope or non-route navigations', async () => {
    const worker = loadWorker(V3)
    await worker.dispatch('install', {})
    const responses: unknown[] = []
    const run = (request: Record<string, unknown>) => {
      let intercepted = false
      worker.listeners.get('fetch')?.({ request, respondWith: () => { intercepted = true } })
      responses.push(intercepted)
    }
    run({ method: 'POST', url: ORIGIN, mode: 'cors' })
    run({ method: 'GET', url: 'https://cdn.example.net/nimvo/x.js', mode: 'cors' })
    run({ method: 'GET', url: 'https://example.test/other/x.js', mode: 'cors' })
    run({ method: 'GET', url: `${ORIGIN}robots.txt`, mode: 'navigate' })
    expect(responses).toEqual([false, false, false, false])
  })
})
