import { afterEach, describe, expect, it, vi } from 'vitest'

import { workerKdf } from './kdf.ts'

const params = { memoryKiB: 19_456, timeCost: 2, parallelism: 1 }

class StubWorker {
  static instance: StubWorker
  static constructorError: Error | null = null
  static postError: Error | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onmessageerror: (() => void) | null = null
  terminate = vi.fn()
  posted: { message: unknown; transfer: unknown } | null = null
  constructor() {
    if (StubWorker.constructorError) throw StubWorker.constructorError
    StubWorker.instance = this
  }
  postMessage(message: unknown, transfer: unknown) {
    if (StubWorker.postError) throw StubWorker.postError
    this.posted = { message, transfer }
  }
}

const start = () => {
  const password = new Uint8Array([1, 2, 3])
  const result = workerKdf.derive(password, new Uint8Array(16), params)
  return { password, result }
}

describe('workerKdf', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    StubWorker.constructorError = null
    StubWorker.postError = null
  })

  it('transfers the password to the worker and resolves with its keys, then terminates it', async () => {
    vi.stubGlobal('Worker', StubWorker)
    const { password, result } = start()
    expect(StubWorker.instance.posted?.transfer).toEqual([password.buffer])
    const keys = { ok: true, encryptKey: {}, decryptKey: {} }
    StubWorker.instance.onmessage?.({ data: keys })
    await expect(result).resolves.toEqual({ encryptKey: keys.encryptKey, decryptKey: keys.decryptKey })
    expect(StubWorker.instance.terminate).toHaveBeenCalled()
  })

  it.each([
    ['a failure reported by the worker', (worker: StubWorker) => worker.onmessage?.({ data: { ok: false } })],
    ['a script load or runtime error', (worker: StubWorker) => worker.onerror?.()],
    ['an undeliverable message', (worker: StubWorker) => worker.onmessageerror?.()],
  ])('rejects instead of hanging on %s and terminates the worker', async (_name, trigger) => {
    vi.stubGlobal('Worker', StubWorker)
    const { result } = start()
    trigger(StubWorker.instance)
    await expect(result).rejects.toThrow('Key derivation failed')
    expect(StubWorker.instance.terminate).toHaveBeenCalled()
  })

  it('zeroes the password and rejects when the worker cannot be created', async () => {
    vi.stubGlobal('Worker', StubWorker)
    StubWorker.constructorError = new Error('blocked by CSP')
    const { password, result } = start()
    await expect(result).rejects.toThrow('blocked by CSP')
    expect([...password]).toEqual([0, 0, 0])
  })

  it('zeroes the password and rejects when posting the request fails', async () => {
    vi.stubGlobal('Worker', StubWorker)
    StubWorker.postError = new Error('DataCloneError')
    const { password, result } = start()
    await expect(result).rejects.toThrow('DataCloneError')
    expect([...password]).toEqual([0, 0, 0])
    expect(StubWorker.instance.terminate).toHaveBeenCalled()
  })
})
