/**
 * The File System Access API is not present in every browser (and its types
 * are not present in every version of lib.dom). Keep the browser surface
 * structural so the vault does not need to persist or know about a concrete
 * handle implementation.
 */
export interface VaultFileHandle {
  readonly name?: string
  getFile(): Promise<Blob & { name?: string }>
  createWritable(): Promise<VaultWritable>
}

export interface VaultWritable {
  write(data: Uint8Array): Promise<void>
  close(): Promise<void>
  abort?: () => Promise<void>
}

export interface VaultFileSelection {
  bytes: Uint8Array
  name: string
  target: VaultFileHandle
}

export interface VaultSaveSelection {
  name: string
  target: VaultFileHandle
}

export interface VaultFileAccessLike {
  readonly directFileAccessSupported: boolean
  open(): Promise<VaultFileSelection | null>
  saveAs(suggestedName: string): Promise<VaultSaveSelection | null>
  write(target: VaultFileHandle, bytes: Uint8Array): Promise<void>
}

interface FilePickerWindow {
  readonly isSecureContext?: boolean
  readonly showOpenFilePicker?: (options?: unknown) => Promise<VaultFileHandle[]>
  readonly showSaveFilePicker?: (options?: unknown) => Promise<VaultFileHandle>
}

const isAbortError = (error: unknown): boolean =>
  (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
  (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')

const browserWindow = (): FilePickerWindow | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as FilePickerWindow)

/** Browser adapter for progressive File System Access. Handles never leave memory. */
export class VaultFileAccess implements VaultFileAccessLike {
  readonly directFileAccessSupported: boolean
  private readonly pickerWindow: FilePickerWindow | undefined

  constructor(pickerWindow: FilePickerWindow | undefined = browserWindow()) {
    this.pickerWindow = pickerWindow
    this.directFileAccessSupported = Boolean(
      pickerWindow?.isSecureContext && pickerWindow.showOpenFilePicker && pickerWindow.showSaveFilePicker,
    )
  }

  async open(): Promise<VaultFileSelection | null> {
    if (!this.directFileAccessSupported || !this.pickerWindow?.showOpenFilePicker) return null
    try {
      const [target] = await this.pickerWindow.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Archivo Moneo', accept: { 'application/octet-stream': ['.moneo'] } }],
        excludeAcceptAllOption: false,
      })
      if (!target) return null
      const file = await target.getFile()
      return {
        bytes: new Uint8Array(await file.arrayBuffer()),
        name: target.name ?? file.name ?? 'archivo.moneo',
        target,
      }
    } catch (error) {
      if (isAbortError(error)) return null
      throw error
    }
  }

  async saveAs(suggestedName: string): Promise<VaultSaveSelection | null> {
    if (!this.directFileAccessSupported || !this.pickerWindow?.showSaveFilePicker) return null
    try {
      const target = await this.pickerWindow.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'Archivo Moneo', accept: { 'application/octet-stream': ['.moneo'] } }],
        excludeAcceptAllOption: false,
      })
      return { name: target.name ?? suggestedName, target }
    } catch (error) {
      if (isAbortError(error)) return null
      throw error
    }
  }

  async write(target: VaultFileHandle, bytes: Uint8Array): Promise<void> {
    const writable = await target.createWritable()
    try {
      await writable.write(bytes)
      await writable.close()
    } catch (error) {
      try { await writable.abort?.() } catch { /* Best effort: the handle may already be closed. */ }
      throw error
    }
  }
}

export { isAbortError }
