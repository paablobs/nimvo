import { createDatabaseClient, type DatabaseClient } from '../../db/index.ts'
import type { DomainOperation } from '../../db/worker/protocol.ts'
import {
  decryptNimvoFile,
  encryptSqliteBytes,
  importPasswordKey,
  INVALID_NIMVO_FILE_MESSAGE,
  NimvoCryptoError,
  UNSUPPORTED_NIMVO_VERSION_MESSAGE,
} from '../../crypto/index.ts'
import {
  isAbortError,
  VaultFileAccess,
  type VaultFileAccessLike,
  type VaultFileHandle,
  type VaultFileSelection,
} from './VaultFileAccess.ts'

export type VaultStatus = 'locked' | 'opening' | 'unlocked' | 'error'

export interface VaultSnapshot {
  status: VaultStatus
  dirty: boolean
  lastExportAt: Date | null
  error: string | null
  activeFileName: string | null
  directFileAccessSupported: boolean
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
  fileAccess?: VaultFileAccessLike
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

const initialSnapshot = (directFileAccessSupported = false): VaultSnapshot => ({
  status: 'locked',
  dirty: false,
  lastExportAt: null,
  error: null,
  activeFileName: null,
  directFileAccessSupported,
})

const pad = (value: number): string => String(value).padStart(2, '0')

const filenameFor = (date: Date): string =>
  `nimvo-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.nimvo`

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
  private readonly fileAccess: VaultFileAccessLike
  private snapshot: VaultSnapshot
  private client: DatabaseClientLike | undefined
  private passwordKey: CryptoKey | undefined
  private activeTarget: VaultFileHandle | undefined
  private queue: Promise<unknown> = Promise.resolve()
  private readonly listeners = new Set<Listener>()

  constructor(options: VaultSessionOptions = {}) {
    this.options = {
      createClient: options.createClient ?? (() => createDatabaseClient()),
      encrypt: options.encrypt ?? encryptSqliteBytes,
      download: options.download ?? browserDownload,
      now: options.now ?? (() => new Date()),
    }
    this.fileAccess = options.fileAccess ?? new VaultFileAccess()
    this.snapshot = initialSnapshot(this.fileAccess.directFileAccessSupported)
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
        this.activeTarget = undefined
        this.setSnapshot({ status: 'unlocked', dirty: true, lastExportAt: null, error: null, activeFileName: null })
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

  private async openBytes(bytes: Uint8Array, password: string, selection: VaultFileSelection | null): Promise<void> {
      const previousSnapshot = this.snapshot
      const previousClient = this.client
      const previousKey = this.passwordKey
      const previousTarget = this.activeTarget
      this.setSnapshot({ status: 'opening', error: null })
      const container = new Uint8Array(bytes)
      let plaintext: Uint8Array | undefined
      let key: CryptoKey | undefined
      let candidate: DatabaseClientLike | undefined
      try {
        // Authentication happens before constructing or opening a worker.
        const decrypted = await decryptNimvoFile(container, password)
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
        // Legacy-format files are read-only imports. Never keep their picker
        // handle, otherwise a later save could overwrite the old format.
        this.activeTarget = selection && decrypted.metadata.format === 'nimvo' ? selection.target : undefined
        this.setSnapshot({
          status: 'unlocked',
          dirty: false,
          lastExportAt: null,
          error: null,
          activeFileName: selection && decrypted.metadata.format === 'nimvo' ? selection.name : null,
        })
      } catch (error) {
        await closeQuietly(candidate)
        this.client = previousClient
        this.passwordKey = previousKey
        this.activeTarget = previousTarget
        const errorMessage = error instanceof NimvoCryptoError && error.code === 'UNSUPPORTED_VERSION'
          ? UNSUPPORTED_NIMVO_VERSION_MESSAGE
          : INVALID_NIMVO_FILE_MESSAGE
        this.setSnapshot(previousSnapshot.status === 'unlocked'
          ? previousSnapshot
          : { ...previousSnapshot, status: 'error', dirty: false, error: errorMessage })
        throw error
      } finally {
        container.fill(0)
        plaintext?.fill(0)
        key = undefined
      }
  }

  async open(bytes: Uint8Array, password: string): Promise<void> {
    return this.enqueue(() => this.openBytes(bytes, password, null))
  }

  /** Opens through the system picker. A selected handle is committed atomically with the vault. */
  async openFromPicker(password: string): Promise<boolean> {
    let selectionPromise: Promise<VaultFileSelection | null>
    try {
      // Invoke the picker before enqueueing anything: browsers require the
      // transient user activation to still be present at this point.
      selectionPromise = this.fileAccess.open()
    } catch (error) {
      selectionPromise = Promise.reject(error)
    }
    return this.enqueue(async () => {
      let selection: VaultFileSelection | null
      try {
        selection = await selectionPromise
      } catch (error) {
        if (isAbortError(error)) return false
        throw error
      }
      if (!selection) return false
      try {
        await this.openBytes(selection.bytes, password, selection)
        return true
      } finally {
        selection.bytes.fill(0)
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

  private async exportEncrypted(): Promise<{ bytes: Uint8Array; exportedAt: Date }> {
    const client = this.requireClient()
    const key = this.passwordKey
    if (!key) throw new Error('La bóveda está bloqueada.')
    const exported = await client.export()
    try {
      return { bytes: await this.options.encrypt(exported, key), exportedAt: this.options.now() }
    } finally {
      exported.fill(0)
    }
  }

  private async saveDownload(): Promise<SaveResult> {
    const { bytes, exportedAt } = await this.exportEncrypted()
    const filename = filenameFor(exportedAt)
    try {
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' })
      await this.options.download(blob, filename)
      this.setSnapshot({ dirty: false, lastExportAt: exportedAt, error: null })
      return { filename, exportedAt }
    } catch (error) {
      this.setSnapshot({ error: 'No se pudo guardar la copia.' })
      throw error
    } finally {
      bytes.fill(0)
    }
  }

  async saveToFile(): Promise<SaveResult | null> {
    const targetAtInvocation = this.activeTarget
    let pickerPromise: Promise<ReturnType<VaultFileAccessLike['saveAs']> extends Promise<infer T> ? T : never> | undefined
    if (!targetAtInvocation && this.fileAccess.directFileAccessSupported) {
      try {
        // As with opening, request the destination while the click activation
        // is live. Exporting and encryption wait inside the session queue.
        pickerPromise = this.fileAccess.saveAs(filenameFor(this.options.now()))
      } catch (error) {
        pickerPromise = Promise.reject(error)
      }
    }
    return this.enqueue(async () => {
      let pickerSelection: Awaited<typeof pickerPromise>
      if (pickerPromise) {
        try {
          pickerSelection = await pickerPromise
        } catch (error) {
          if (isAbortError(error)) return null
          this.setSnapshot({ error: 'No se pudo guardar la copia.' })
          throw error
        }
        if (!pickerSelection) return null
      }
      const { bytes, exportedAt } = await this.exportEncrypted()
      const suggestedName = filenameFor(exportedAt)
      let selectedTarget: VaultFileHandle | undefined
      let selectedName = suggestedName
      try {
        if (targetAtInvocation) {
          await this.fileAccess.write(targetAtInvocation, bytes)
          selectedTarget = targetAtInvocation
          selectedName = this.snapshot.activeFileName ?? suggestedName
        } else if (pickerSelection) {
          await this.fileAccess.write(pickerSelection.target, bytes)
          selectedTarget = pickerSelection.target
          selectedName = pickerSelection.name
        } else {
          const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' })
          await this.options.download(blob, suggestedName)
        }
        this.activeTarget = selectedTarget
        this.setSnapshot({ activeFileName: selectedTarget ? selectedName : null, dirty: false, lastExportAt: exportedAt, error: null })
        return { filename: selectedTarget ? selectedName : suggestedName, exportedAt }
      } catch (error) {
        if (isAbortError(error)) return null
        this.setSnapshot({ error: 'No se pudo guardar la copia.' })
        throw error
      } finally {
        bytes.fill(0)
      }
    })
  }

  async saveAs(): Promise<SaveResult | null> {
    let pickerPromise: ReturnType<VaultFileAccessLike['saveAs']>
    if (this.fileAccess.directFileAccessSupported) {
      try {
        // Keep this call synchronous with the user action for browser picker activation.
        pickerPromise = this.fileAccess.saveAs(filenameFor(this.options.now()))
      } catch (error) {
        pickerPromise = Promise.reject(error)
      }
    } else {
      pickerPromise = Promise.resolve(null)
    }
    return this.enqueue(async () => {
      if (!this.fileAccess.directFileAccessSupported) return this.saveDownload()
      let selection: Awaited<typeof pickerPromise>
      try {
        selection = await pickerPromise
      } catch (error) {
        if (isAbortError(error)) return null
        this.setSnapshot({ error: 'No se pudo guardar la copia.' })
        throw error
      }
      if (!selection) return null
      const { bytes, exportedAt } = await this.exportEncrypted()
      try {
        await this.fileAccess.write(selection.target, bytes)
        this.activeTarget = selection.target
        this.setSnapshot({ activeFileName: selection.name, dirty: false, lastExportAt: exportedAt, error: null })
        return { filename: selection.name, exportedAt }
      } catch (error) {
        if (isAbortError(error)) return null
        this.setSnapshot({ error: 'No se pudo guardar la copia.' })
        throw error
      } finally {
        bytes.fill(0)
      }
    })
  }

  async saveCopy(): Promise<SaveResult> {
    return this.enqueue(async () => this.saveDownload())
  }

  async save(): Promise<SaveResult | null> {
    return this.saveToFile()
  }

  export(): Promise<SaveResult | null> { return this.saveToFile() }

  async lock(): Promise<void> {
    return this.enqueue(async () => {
      const client = this.client
      this.client = undefined
      this.passwordKey = undefined
      this.activeTarget = undefined
      await closeQuietly(client)
      this.setSnapshot({ ...initialSnapshot(this.fileAccess.directFileAccessSupported) })
    })
  }

  handleBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.snapshot.dirty) return
    event.preventDefault()
    event.returnValue = ''
  }
}

export type { DatabaseClient }
