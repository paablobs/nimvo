import { createDatabaseClient, type DatabaseClient } from '../../db/index.ts'
import type { DomainOperation } from '../../db/worker/protocol.ts'
import {
  INVALID_NIMVO_FILE_MESSAGE,
  NimvoCryptoError,
  UNSUPPORTED_NIMVO_VERSION_MESSAGE,
} from '../../crypto/index.ts'
import { defaultKdf, type Kdf } from '../../crypto/kdf.ts'
import {
  clearVaultKey,
  createVaultKey,
  encryptVault,
  openVaultContainer,
  type FormatVersion,
  type VaultKey,
} from '../../crypto/vault.ts'
import {
  isAbortError,
  VaultFileAccess,
  type VaultFileAccessLike,
  type VaultFileHandle,
  type VaultFileSelection,
} from './VaultFileAccess.ts'
import { DEFAULT_CURRENCY, isCurrencyCode, type CurrencyCode } from '../../domain/currency.ts'

export type VaultStatus = 'locked' | 'opening' | 'unlocked' | 'error'

export interface VaultSnapshot {
  status: VaultStatus
  dirty: boolean
  lastExportAt: Date | null
  error: string | null
  activeFileName: string | null
  directFileAccessSupported: boolean
  currency: CurrencyCode
  /** The open file uses an older container format; the next save rewrites it in the current one. */
  formatUpgradePending: boolean
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
  encrypt?: (plaintext: Uint8Array, key: VaultKey) => Promise<Uint8Array>
  /** Key-derivation strategy; defaults to Argon2id in a Worker. */
  kdf?: Kdf
  /** Container version written on save; defaults to the current format. */
  formatVersion?: FormatVersion
  download?: (blob: Blob, filename: string) => void | Promise<void>
  now?: () => Date
  fileAccess?: VaultFileAccessLike
}

type Listener = () => void

const mutationKinds = new Set([
  'vault.setCurrency',
  'months.create', 'months.update', 'months.delete',
  'months.createWithDebts', 'months.createWithTemplates',
  'categories.create', 'categories.update', 'categories.delete',
  'categories.archive', 'categories.restore',
  'templates.create', 'templates.update', 'templates.delete',
  'templates.archive', 'templates.restore', 'templates.reorder',
  'debts.create', 'debts.update', 'debts.delete',
  'debts.reorder',
  'expenses.create', 'expenses.update', 'expenses.delete',
])

const initialSnapshot = (directFileAccessSupported = false): VaultSnapshot => ({
  status: 'locked',
  dirty: false,
  lastExportAt: null,
  error: null,
  activeFileName: null,
  directFileAccessSupported,
  currency: DEFAULT_CURRENCY,
  formatUpgradePending: false,
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
  private readonly options: Required<Pick<VaultSessionOptions, 'createClient' | 'encrypt' | 'download' | 'now' | 'kdf'>> & Pick<VaultSessionOptions, 'formatVersion'>
  private readonly fileAccess: VaultFileAccessLike
  private snapshot: VaultSnapshot
  private client: DatabaseClientLike | undefined
  private vaultKey: VaultKey | undefined
  private activeTarget: VaultFileHandle | undefined
  private queue: Promise<unknown> = Promise.resolve()
  private readonly listeners = new Set<Listener>()

  constructor(options: VaultSessionOptions = {}) {
    this.options = {
      createClient: options.createClient ?? (() => createDatabaseClient()),
      encrypt: options.encrypt ?? ((plaintext, key) => encryptVault(plaintext, key)),
      kdf: options.kdf ?? defaultKdf(),
      formatVersion: options.formatVersion,
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

  private cryptoOptions() {
    return { kdf: this.options.kdf, formatVersion: this.options.formatVersion }
  }

  private requireClient(): DatabaseClientLike {
    if (this.snapshot.status !== 'unlocked' || !this.client || !this.vaultKey) {
      throw new Error('La bóveda está bloqueada.')
    }
    return this.client
  }

  async create(password: string): Promise<void> {
    return this.enqueue(async () => {
      const previousSnapshot = this.snapshot
      const previousClient = this.client
      const previousKey = this.vaultKey
      this.setSnapshot({ status: 'opening', error: null })
      let key: VaultKey | undefined
      let candidate: DatabaseClientLike | undefined
      let committed = false
      try {
        key = await createVaultKey(password, this.cryptoOptions())
        candidate = this.options.createClient()
        await candidate.open()
        const currency = await candidate.operation<unknown>({ kind: 'vault.getCurrency' })
        await closeQuietly(this.client)
        const replacedKey = this.vaultKey
        this.client = candidate
        this.vaultKey = key
        clearVaultKey(replacedKey)
        committed = true
        candidate = undefined
        key = undefined
        this.activeTarget = undefined
        this.setSnapshot({ status: 'unlocked', dirty: true, lastExportAt: null, error: null, activeFileName: null, formatUpgradePending: false, currency: isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY })
      } catch (error) {
        // Once the new state is committed the previous client and key are gone; never roll back to them.
        if (committed) throw error
        await closeQuietly(candidate)
        clearVaultKey(key)
        this.client = previousClient
        this.vaultKey = previousKey
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
      const previousKey = this.vaultKey
      const previousTarget = this.activeTarget
      this.setSnapshot({ status: 'opening', error: null })
      const container = new Uint8Array(bytes)
      let plaintext: Uint8Array | undefined
      let key: VaultKey | undefined
      let candidate: DatabaseClientLike | undefined
      let committed = false
      try {
        // Authentication happens before constructing or opening a worker.
        const decrypted = await openVaultContainer(container, password, this.cryptoOptions())
        plaintext = decrypted.plaintext
        key = decrypted.vaultKey
        candidate = this.options.createClient()
        // DatabaseClient transfers its argument, so this copy is disposable.
        await candidate.open(new Uint8Array(plaintext))
        const currency = await candidate.operation<unknown>({ kind: 'vault.getCurrency' })
        await closeQuietly(this.client)
        const replacedKey = this.vaultKey
        this.client = candidate
        this.vaultKey = key
        clearVaultKey(replacedKey)
        committed = true
        candidate = undefined
        key = undefined
        // Legacy-format files are read-only imports. Never keep their picker
        // handle, otherwise a later save could overwrite the old format.
        this.activeTarget = selection && decrypted.format === 'nimvo' ? selection.target : undefined
        this.setSnapshot({
          status: 'unlocked',
          dirty: false,
          lastExportAt: null,
          error: null,
          activeFileName: selection && decrypted.format === 'nimvo' ? selection.name : null,
          currency: isCurrencyCode(currency) ? currency : DEFAULT_CURRENCY,
          // A v1 or legacy file is rewritten in the current format by the next save.
          formatUpgradePending: decrypted.sourceVersion === 1 && decrypted.vaultKey.kind === 'argon2id',
        })
      } catch (error) {
        if (committed) throw error
        await closeQuietly(candidate)
        clearVaultKey(key)
        this.client = previousClient
        this.vaultKey = previousKey
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
      if (operation.kind === 'vault.setCurrency') {
        this.setSnapshot({ dirty: true, error: null, currency: isCurrencyCode(result) ? result : operation.currency })
      } else if (mutationKinds.has(operation.kind)) this.setSnapshot({ dirty: true, error: null })
      return result
    })
  }

  private async exportEncrypted(): Promise<{ bytes: Uint8Array; exportedAt: Date }> {
    const client = this.requireClient()
    const key = this.vaultKey
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
      this.setSnapshot({ dirty: false, lastExportAt: exportedAt, error: null, formatUpgradePending: false })
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
        this.setSnapshot({ activeFileName: selectedTarget ? selectedName : null, dirty: false, lastExportAt: exportedAt, error: null, formatUpgradePending: false })
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
        this.setSnapshot({ activeFileName: selection.name, dirty: false, lastExportAt: exportedAt, error: null, formatUpgradePending: false })
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
      clearVaultKey(this.vaultKey)
      this.vaultKey = undefined
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
