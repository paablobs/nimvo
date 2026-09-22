import { describe, expect, it, vi } from 'vitest'
import type { WorkerRequest, WorkerResponse } from './protocol.ts'
import type { WorkerLike } from './client.ts'
import { DatabaseClient } from './client.ts'

type Listener = (event: Event) => void

class FakeWorker implements WorkerLike {
  readonly posted: WorkerRequest[] = []
  readonly terminate = vi.fn()
  failPost = false
  private readonly listeners = new Map<string, Set<Listener>>()

  addEventListener(type: 'message' | 'error' | 'messageerror', listener: Listener): void {
    const listeners = this.listeners.get(type) ?? new Set<Listener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: 'message' | 'error' | 'messageerror', listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  postMessage(message: WorkerRequest): void {
    if (this.failPost) throw new Error('cannot post message')
    this.posted.push(message)
  }

  emit(type: 'message' | 'error' | 'messageerror', event: Event): void {
    this.listeners.get(type)?.forEach((listener) => listener(event))
  }

  respond(response: WorkerResponse): void {
    this.emit('message', new MessageEvent('message', { data: response }))
  }
}

describe('DatabaseClient', () => {
  it('rejects and tears down all pending calls on worker errors', async () => {
    const worker = new FakeWorker()
    const client = new DatabaseClient(worker)
    const opening = client.open()
    const exporting = client.export()

    worker.emit('error', new ErrorEvent('error', { message: 'worker crashed' }))

    await expect(opening).rejects.toThrow('worker crashed')
    await expect(exporting).rejects.toThrow('worker crashed')
    expect(worker.terminate).toHaveBeenCalledOnce()
    await expect(client.close()).resolves.toBeUndefined()
    expect(worker.posted).toHaveLength(2)
  })

  it('rejects pending calls on messageerror', async () => {
    const worker = new FakeWorker()
    const client = new DatabaseClient(worker)
    const pending = client.operation({ kind: 'months.list' })

    worker.emit('messageerror', new Event('messageerror'))

    await expect(pending).rejects.toThrow('Database worker failed')
    await expect(client.close()).resolves.toBeUndefined()
  })

  it('rejects the failed call and pending calls when postMessage throws', async () => {
    const worker = new FakeWorker()
    const client = new DatabaseClient(worker)
    const pending = client.operation({ kind: 'months.list' })
    worker.failPost = true

    const failed = client.export()

    await expect(pending).rejects.toThrow('cannot post message')
    await expect(failed).rejects.toThrow('cannot post message')
    expect(worker.terminate).toHaveBeenCalledOnce()
    await expect(client.close()).resolves.toBeUndefined()
  })

  it('makes close idempotent after a successful close', async () => {
    const worker = new FakeWorker()
    const client = new DatabaseClient(worker)
    const closing = client.close()
    const secondClose = client.close()
    const request = worker.posted[0]
    if (request.type !== 'close') throw new Error('expected close request')
    worker.respond({ type: 'success', requestId: request.requestId, result: null })

    await expect(closing).resolves.toBeUndefined()
    await expect(secondClose).resolves.toBeUndefined()
    await expect(client.close()).resolves.toBeUndefined()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('tears down when the worker rejects the close request', async () => {
    const worker = new FakeWorker()
    const client = new DatabaseClient(worker)
    const closing = client.close()
    const request = worker.posted[0]
    if (request.type !== 'close') throw new Error('expected close request')
    worker.respond({ type: 'error', requestId: request.requestId, error: { code: 'database', message: 'close failed' } })

    await expect(closing).rejects.toThrow('close failed')
    expect(worker.terminate).toHaveBeenCalledOnce()
    await expect(client.close()).resolves.toBeUndefined()
  })
})
