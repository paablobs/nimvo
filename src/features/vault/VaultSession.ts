import { createDatabaseClient, type DatabaseClient } from '../../db/index.ts'
import type { DomainOperation } from '../../db/worker/protocol.ts'
import {
  decryptMoneoFile,
  encryptSqliteBytes,
  importPasswordKey,
  INVALID_MONEO_FILE_MESSAGE,
  MoneoCryptoError,
  UNSUPPORTED_MONEO_VERSION_MESSAGE,
} from '../../crypto/index.ts'

export type VaultStatus = 'locked' | 'opening' | 'unlocked' | 'error'

export interface VaultSnapshot {
  status: VaultStatus
  dirty: boolean
  lastExportAt: Date | null
  error: string | null
}

export interface DatabaseClientLike {
  open(bytes?: Uint8Array): Promise<void>
  export(): Promise<Uint8Array>
  close(): Promise<void>
  operation<T>(operation: DomainOperation): Promise<T>
}

export interface SaveResult {
  filename: string
  exportedAt: Date
}

export interface VaultSessionOptions {
  createClient?: () => DatabaseClientLike
  encrypt?: typeof encryptSqliteBytes
  download?: (blob: Blob, filename: string) => void | Promise<void>
  now?: () => Date
}

type Listener = () => void

const mutationKinds = new Set([
  'months.create', 'months.update', 'months.delete',
  'months.createWithDebts', 'months.createWithTemplates',
  'categories.create', 'categories.update', 'categories.delete',
  'categories.archive', 'categories.restore',
  'templates.create', 'templates.update', 'templates.delete',
  'templates.archive', 'templates.restore',
  'debts.create', 'debts.update', 'debts.delete',
  'expenses.create', 'expenses.update', 'expenses.delete',
])

const initialSnapshot = (): VaultSnapshot => ({
  status: 'locked',
  dirty: false,
  lastExportAt: null,
  error: null,
})

const pad = (value: number): string => String(value).padStart(2, '0')

const filenameFor = (date: Date): string =>
  `moneo-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.moneo`

const browserDownload = (blob: Blob, filename: string): void => {
  if (typeof document === 'undefined' || !URL.createObjectURL) throw new Error('Descarga no disponible')
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const closeQuietly = async (client: DatabaseClientLike | undefined): Promise<void> => {
  if (!client) return
  try { await client.close() } catch { /* A lock must clear secrets even if a worker is gone. */ }
}

/** Owns the in-memory key and worker for one unlocked vault. */
export class VaultSession {
  private readonly options: Required<Pick<VaultSessionOptions, 'createClient' | 'encrypt' | 'download' | 'now'>>
  private snapshot: VaultSnapshot = initialSnapshot()
  private client: DatabaseClientLike | undefined
  private passwordKey: CryptoKey | undefined
  private queue: Promise<unknown> = Promise.resolve()
  private readonly listeners = new Set<Listener>()

  constructor(options: VaultSessionOptions = {}) {
    this.options = {
      createClient: options.createClient ?? (() => createDatabaseClient()),
      encrypt: options.encrypt ?? encryptSqliteBytes,
      download: options.download ?? browserDownload,
      now: options.now ?? (() => new Date()),
    }
  }

  getSnapshot = (): VaultSnapshot => this.snapshot

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private setSnapshot(update: Partial<VaultSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...update }
    this.listeners.forEach((listener) => listener())
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }

  private requireClient(): DatabaseClientLike {
    if (this.snapshot.status !== 'unlocked' || !this.client || !this.passwordKey) {
      throw new Error('La bóveda está bloqueada.')
    }
    return this.client
  }

  async create(password: string): Promise<void> {
    return this.enqueue(async () => {
      const previousSnapshot = this.snapshot
      const previousClient = this.client
      const previousKey = this.passwordKey
      this.setSnapshot({ status: 'opening', error: null })
      let key: CryptoKey | undefined
      let candidate: DatabaseClientLike | undefined
      try {
        key = await importPasswordKey(password)
        candidate = this.options.createClient()
        await candidate.open()
        await closeQuietly(this.client)
        this.client = candidate
        this.passwordKey = key
        candidate = undefined
        key = undefined
        this.setSnapshot({ status: 'unlocked', dirty: true, lastExportAt: null, error: null })
      } catch (error) {
        await closeQuietly(candidate)
        this.client = previousClient
        this.passwordKey = previousKey
        this.setSnapshot(previousSnapshot.status === 'unlocked'
          ? previousSnapshot
          : { ...previousSnapshot, status: 'error', dirty: false, error: 'No se pudo crear la bóveda.' })
        throw error
      }
    })
  }

  async open(bytes: Uint8Array, password: string): Promise<void> {
    return this.enqueue(async () => {
      const previousSnapshot = this.snapshot
      const previousClient = this.client
      const previousKey = this.passwordKey
      this.setSnapshot({ status: 'opening', error: null })
      const container = new Uint8Array(bytes)
      let plaintext: Uint8Array | undefined
      let key: CryptoKey | undefined
      let candidate: DatabaseClientLike | undefined
      try {
        // Authentication happens before constructing or opening a worker.
        const decrypted = await decryptMoneoFile(container, password)
        plaintext = decrypted.plaintext
        key = decrypted.passwordKey
        candidate = this.options.createClient()
        // DatabaseClient transfers its argument, so this copy is disposable.
        await candidate.open(new Uint8Array(plaintext))
        await closeQuietly(this.client)
        this.client = candidate
        this.passwordKey = key
        candidate = undefined
        key = undefined
        this.setSnapshot({ status: 'unlocked', dirty: false, lastExportAt: null, error: null })
      } catch (error) {
        await closeQuietly(candidate)
        this.client = previousClient
        this.passwordKey = previousKey
        const errorMessage = error instanceof MoneoCryptoError && error.code === 'UNSUPPORTED_VERSION'
          ? UNSUPPORTED_MONEO_VERSION_MESSAGE
          : INVALID_MONEO_FILE_MESSAGE
        this.setSnapshot(previousSnapshot.status === 'unlocked'
          ? previousSnapshot
          : { ...previousSnapshot, status: 'error', dirty: false, error: errorMessage })
        throw error
      } finally {
        container.fill(0)
        plaintext?.fill(0)
        key = undefined
      }
    })
  }

  operation<T>(operation: DomainOperation): Promise<T> {
    return this.enqueue(async () => {
      const client = this.requireClient()
      const result = await client.operation<T>(operation)
      if (mutationKinds.has(operation.kind)) this.setSnapshot({ dirty: true, error: null })
      return result
    })
  }

  async save(): Promise<SaveResult> {
    return this.enqueue(async () => {
      const client = this.requireClient()
      const key = this.passwordKey
      if (!key) throw new Error('La bóveda está bloqueada.')
      const exported = await client.export()
      const exportedAt = this.options.now()
      let encrypted: Uint8Array | undefined
      try {
        encrypted = await this.options.encrypt(exported, key)
        const blob = new Blob([encrypted.buffer as ArrayBuffer], { type: 'application/octet-stream' })
        const filename = filenameFor(exportedAt)
        await this.options.download(blob, filename)
        this.setSnapshot({ dirty: false, lastExportAt: exportedAt, error: null })
        return { filename, exportedAt }
      } catch (error) {
        this.setSnapshot({ error: 'No se pudo guardar la copia.' })
        throw error
      } finally {
        exported.fill(0)
        encrypted?.fill(0)
      }
    })
  }

  export(): Promise<SaveResult> { return this.save() }

  async lock(): Promise<void> {
    return this.enqueue(async () => {
      const client = this.client
      this.client = undefined
      this.passwordKey = undefined
      await closeQuietly(client)
      this.setSnapshot({ ...initialSnapshot() })
    })
  }

  handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.snapshot.dirty) return
    event.preventDefault()
    event.returnValue = ''
  }
}

export type { DatabaseClient }
