import type { DomainOperation, WorkerRequest, WorkerResponse } from './protocol.ts'

export type WorkerLike = {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void
  addEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void): void
  removeEventListener(type: 'message' | 'error' | 'messageerror', listener: (event: Event) => void): void
  terminate?(): void
}

type RequestWithoutId =
  | { type: 'open'; bytes?: Uint8Array }
  | { type: 'export' }
  | { type: 'close' }
  | { type: 'operation'; operation: DomainOperation }

const requestId = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export class DatabaseClient {
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private state: 'active' | 'closing' | 'failed' | 'closed' = 'active'
  private terminalError: Error | undefined
  private workerTornDown = false
  private closePromise: Promise<void> | undefined
  private readonly onMessage = (event: Event): void => {
    const response = (event as MessageEvent<WorkerResponse>).data
    const pending = this.pending.get(response.requestId)
    if (!pending) return
    this.pending.delete(response.requestId)
    if (response.type === 'success') pending.resolve(response.result)
    else pending.reject(Object.assign(new Error(response.error.message), { code: response.error.code }))
  }
  private readonly onWorkerError = (event: Event): void => {
    const message = 'message' in event && typeof event.message === 'string' && event.message ? event.message : 'Database worker failed'
    this.fail(new Error(message))
  }

  private readonly worker: WorkerLike
  constructor(worker: WorkerLike) {
    this.worker = worker
    worker.addEventListener('message', this.onMessage)
    worker.addEventListener('error', this.onWorkerError)
    worker.addEventListener('messageerror', this.onWorkerError)
  }

  private teardown(): void {
    if (this.workerTornDown) return
    this.workerTornDown = true
    this.worker.removeEventListener('message', this.onMessage)
    this.worker.removeEventListener('error', this.onWorkerError)
    this.worker.removeEventListener('messageerror', this.onWorkerError)
    this.worker.terminate?.()
  }

  private fail(error: Error): void {
    if (this.state !== 'active' && this.state !== 'closing') return
    this.state = 'failed'
    this.terminalError = error
    const pending = [...this.pending.values()]
    this.pending.clear()
    this.teardown()
    pending.forEach(({ reject }) => reject(error))
  }

  private closeTerminal(): void {
    if (this.state === 'active' || this.state === 'closing') this.state = 'closed'
    const error = this.terminalError ?? new Error('Database client is closed')
    const pending = [...this.pending.values()]
    this.pending.clear()
    this.teardown()
    pending.forEach(({ reject }) => reject(error))
  }

  private send<T>(request: RequestWithoutId, transfer?: Transferable[], allowClosing = false): Promise<T> {
    if (this.state !== 'active' && !(allowClosing && this.state === 'closing')) return Promise.reject(this.terminalError ?? new Error('Database client is closed'))
    const id = requestId()
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      try {
        this.worker.postMessage({ ...request, requestId: id } as WorkerRequest, transfer)
      } catch (error) {
        this.pending.delete(id)
        const failure = error instanceof Error ? error : new Error('Could not send database request')
        this.fail(failure)
        reject(failure)
      }
    })
  }

  open(bytes?: Uint8Array): Promise<void> {
    return this.send({ type: 'open', bytes }, bytes ? [bytes.buffer] : undefined).then(() => undefined)
  }
  export(): Promise<Uint8Array> { return this.send<Uint8Array>({ type: 'export' }) }
  close(): Promise<void> {
    if (this.state === 'closing') return this.closePromise ?? Promise.resolve()
    if (this.state !== 'active') {
      this.closeTerminal()
      return Promise.resolve()
    }
    this.state = 'closing'
    this.closePromise = this.send({ type: 'close' }, undefined, true).then(
      () => { this.closeTerminal() },
      (error: unknown) => {
        const failure = error instanceof Error ? error : new Error('Could not close database client')
        this.fail(failure)
        throw failure
      },
    )
    return this.closePromise
  }
  operation<T>(operation: DomainOperation): Promise<T> { return this.send<T>({ type: 'operation', operation }) }
}

export const createDatabaseClient = (): DatabaseClient => new DatabaseClient(new Worker(new URL('./database.worker.ts', import.meta.url), { type: 'module' }))
