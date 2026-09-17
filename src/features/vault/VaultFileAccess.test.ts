import { describe, expect, it, vi } from 'vitest'
import { VaultFileAccess, type VaultFileHandle, type VaultWritable } from './VaultFileAccess.ts'

function handle(name: string, bytes = new Uint8Array([1, 2])): VaultFileHandle {
  return {
    name,
    getFile: vi.fn(async () => ({
      name,
      arrayBuffer: async () => bytes.buffer,
    }) as Blob & { name?: string }),
    createWritable: vi.fn(async () => ({
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    } satisfies VaultWritable)),
  }
}

describe('VaultFileAccess', () => {
  it('detects secure picker support and returns the selected bytes and target', async () => {
    const target = handle('datos.moneo')
    const picker = {
      isSecureContext: true,
      showOpenFilePicker: vi.fn(async () => [target]),
      showSaveFilePicker: vi.fn(async () => target),
    }
    const access = new VaultFileAccess(picker)
    await expect(access.open()).resolves.toMatchObject({ name: 'datos.moneo', target })
    expect(access.directFileAccessSupported).toBe(true)
    await expect(access.saveAs('nuevo.moneo')).resolves.toMatchObject({ name: 'datos.moneo', target })
  })

  it('treats picker cancellation as no-op and aborts a failed write best effort', async () => {
    const abort = vi.fn(async () => undefined)
    const write = vi.fn(async () => { throw new Error('disk full') })
    const target = {
      ...handle('datos.moneo'),
      createWritable: vi.fn(async () => ({ write, close: vi.fn(async () => undefined), abort })),
    }
    const picker = {
      isSecureContext: true,
      showOpenFilePicker: vi.fn(async () => { throw new DOMException('cancel', 'AbortError') }),
      showSaveFilePicker: vi.fn(async () => { throw new DOMException('cancel', 'AbortError') }),
    }
    const access = new VaultFileAccess(picker)
    await expect(access.open()).resolves.toBeNull()
    await expect(access.saveAs('nuevo.moneo')).resolves.toBeNull()

    await expect(access.write(target, new Uint8Array([3]))).rejects.toThrow('disk full')
    expect(write).toHaveBeenCalledOnce()
    expect(abort).toHaveBeenCalledOnce()
  })

  it('does not report direct access outside a secure context', () => {
    const picker = {
      isSecureContext: false,
      showOpenFilePicker: vi.fn(),
      showSaveFilePicker: vi.fn(),
    }
    expect(new VaultFileAccess(picker).directFileAccessSupported).toBe(false)
  })
})
