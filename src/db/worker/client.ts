import type { DomainOperation, WorkerRequest, WorkerResponse } from './protocol.ts'

export type WorkerLike = {
  postMessage(message: WorkerRequest, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerResponse>) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent<WorkerResponse>) => void): void
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
  private readonly onMessage = (event: MessageEvent<WorkerResponse>): void => {
    const pending = this.pending.get(event.data.requestId)
    if (!pending) return
    this.pending.delete(event.data.requestId)
    if (event.data.type === 'success') pending.resolve(event.data.result)
    else pending.reject(Object.assign(new Error(event.data.error.message), { code: event.data.error.code }))
  }

  private readonly worker: WorkerLike
  constructor(worker: WorkerLike) { this.worker = worker; worker.addEventListener('message', this.onMessage) }

  private send<T>(request: RequestWithoutId, transfer?: Transferable[]): Promise<T> {
    const id = requestId()
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject })
      this.worker.postMessage({ ...request, requestId: id } as WorkerRequest, transfer)
    })
  }

  open(bytes?: Uint8Array): Promise<void> {
    return this.send({ type: 'open', bytes }, bytes ? [bytes.buffer] : undefined).then(() => undefined)
  }
  export(): Promise<Uint8Array> { return this.send<Uint8Array>({ type: 'export' }) }
  close(): Promise<void> { return this.send({ type: 'close' }).then(() => { this.worker.removeEventListener('message', this.onMessage); this.worker.terminate?.() }) }
  operation<T>(operation: DomainOperation): Promise<T> { return this.send<T>({ type: 'operation', operation }) }
}

export const createDatabaseClient = (): DatabaseClient => new DatabaseClient(new Worker(new URL('./database.worker.ts', import.meta.url), { type: 'module' }))
