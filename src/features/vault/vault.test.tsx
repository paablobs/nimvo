import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { VaultProvider } from './VaultProvider.tsx'
import { VaultSession, type DatabaseClientLike } from './VaultSession.ts'
import type { VaultFileAccessLike, VaultFileHandle, VaultFileSelection } from './VaultFileAccess.ts'
import CreateVaultPage from './CreateVaultPage.tsx'
import {
  LEGACY_MONEO_MAGIC,
  NIMVO_HEADER_LENGTH,
  NIMVO_IV_LENGTH,
  NIMVO_SALT_LENGTH,
  NIMVO_VERSION,
  encryptSqliteBytes,
  importPasswordKey,
  INVALID_NIMVO_FILE_MESSAGE,
  UNSUPPORTED_NIMVO_VERSION_MESSAGE,
} from '../../crypto/index.ts'
import type { DomainOperation } from '../../db/worker/protocol.ts'

function fakeClient(overrides: Partial<DatabaseClientLike> = {}): DatabaseClientLike {
  return {
    open: vi.fn(async () => undefined),
    export: vi.fn(async () => new Uint8Array([1, 2, 3])),
    close: vi.fn(async () => undefined),
    operation: vi.fn(async (_operation: DomainOperation) => undefined) as DatabaseClientLike['operation'],
    ...overrides,
  }
}

function fakeTarget(name: string): VaultFileHandle {
  return {
    name,
    getFile: vi.fn(async () => new Blob()),
    createWritable: vi.fn(async () => ({
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    })),
  }
}

function fakeFileAccess(overrides: Partial<VaultFileAccessLike> = {}): VaultFileAccessLike {
  return {
    directFileAccessSupported: true,
    open: vi.fn(async () => null),
    saveAs: vi.fn(async () => null),
    write: vi.fn(async () => undefined),
    ...overrides,
  }
}

async function legacyFile(password: string): Promise<Uint8Array> {
  const key = await importPasswordKey(password)
  const salt = new Uint8Array(NIMVO_SALT_LENGTH).fill(3)
  const iv = new Uint8Array(NIMVO_IV_LENGTH).fill(4)
  const plain = new Uint8Array([1, 2, 3])
  const header = new Uint8Array(NIMVO_HEADER_LENGTH + salt.length + iv.length)
  header.set(new TextEncoder().encode(LEGACY_MONEO_MAGIC), 0)
  header[5] = NIMVO_VERSION
  header[6] = 1
  header[7] = 1
  new DataView(header.buffer).setUint32(8, 1_000)
  header[12] = salt.length
  header[13] = iv.length
  new DataView(header.buffer).setUint32(14, plain.length + 16)
  header.set(salt, NIMVO_HEADER_LENGTH)
  header.set(iv, NIMVO_HEADER_LENGTH + salt.length)
  const derived = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt.buffer, iterations: 1_000, hash: 'SHA-256' }, key, 256)
  const aesKey = await globalThis.crypto.subtle.importKey('raw', derived, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer, additionalData: header.buffer, tagLength: 128 }, aesKey, plain.buffer))
  const result = new Uint8Array(header.length + ciphertext.length)
  result.set(header)
  result.set(ciphertext, header.length)
  return result
}

const renderCreate = (session: VaultSession) => render(
  <ChakraProvider value={defaultSystem}>
    <VaultProvider session={session}>
      <MemoryRouter>
        <CreateVaultPage />
      </MemoryRouter>
    </VaultProvider>
  </ChakraProvider>,
)

describe('VaultSession', () => {
  it('loads and persists the vault currency through a serialized mutation', async () => {
    const client = fakeClient({ operation: vi.fn(async (operation: DomainOperation) => operation.kind === 'vault.getCurrency' ? 'ARS' : operation.kind === 'vault.setCurrency' ? operation.currency : undefined) as DatabaseClientLike['operation'] })
    const session = new VaultSession({ createClient: () => client })
    await session.create('password-1')
    expect(session.getSnapshot().currency).toBe('ARS')
    await session.operation({ kind: 'vault.setCurrency', currency: 'EUR' })
    expect(session.getSnapshot()).toMatchObject({ currency: 'EUR', dirty: true })
  })

  it('creates, tracks only successful mutations, and locks the worker', async () => {
    const client = fakeClient()
    const session = new VaultSession({ createClient: () => client })
    await session.create('password-1')
    expect(session.getSnapshot()).toMatchObject({ status: 'unlocked', dirty: true })

    await session.operation({ kind: 'months.list' })
    expect(session.getSnapshot().dirty).toBe(true)
    const fail = vi.fn(async () => { throw new Error('failed') })
    client.operation = fail as DatabaseClientLike['operation']
    await expect(session.operation({ kind: 'months.create', year: 2026, month: 1, initialAmountCents: 1 })).rejects.toThrow('failed')
    expect(session.getSnapshot().dirty).toBe(true)

    client.operation = vi.fn(async (_operation: DomainOperation) => ({ ok: true })) as DatabaseClientLike['operation']
    await session.operation({ kind: 'months.create', year: 2026, month: 1, initialAmountCents: 1 })
    expect(session.getSnapshot().dirty).toBe(true)
    await session.lock()
    expect(session.getSnapshot()).toMatchObject({ status: 'locked', dirty: false })
    expect(client.close).toHaveBeenCalledOnce()
  })

  it('keeps dirty when export or download fails', async () => {
    const client = fakeClient({ export: vi.fn(async () => { throw new Error('export failed') }) })
    const session = new VaultSession({ createClient: () => client })
    await session.create('password-1')
    await expect(session.save()).rejects.toThrow('export failed')
    expect(session.getSnapshot().dirty).toBe(true)

    client.export = vi.fn(async () => new Uint8Array([1, 2]))
    const failedDownload = new VaultSession({
      createClient: () => client,
      encrypt: vi.fn(async () => new Uint8Array([3, 4])),
      download: () => { throw new Error('download failed') },
    })
    await failedDownload.create('password-1')
    await expect(failedDownload.save()).rejects.toThrow('download failed')
    expect(failedDownload.getSnapshot().dirty).toBe(true)
  })

  it('rejects damaged files with the exact public authentication message', async () => {
    const createClient = vi.fn(() => fakeClient())
    const session = new VaultSession({ createClient })
    await expect(session.open(new Uint8Array([0]), 'wrong')).rejects.toThrow()
    expect(session.getSnapshot()).toMatchObject({ status: 'error', error: INVALID_NIMVO_FILE_MESSAGE })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('authenticates before opening the worker and opens clean', async () => {
    const key = await importPasswordKey('password-1')
    const file = await encryptSqliteBytes(new Uint8Array([1, 2, 3]), key, {
      iterations: 1_000,
      rng: (length: number): Uint8Array => new Uint8Array(length).fill(7),
    })
    const client = fakeClient()
    const session = new VaultSession({ createClient: () => client })
    await session.open(file, 'password-1')
    expect(session.getSnapshot()).toMatchObject({ status: 'unlocked', dirty: false })
    expect(client.open).toHaveBeenCalledOnce()
  })

  it('keeps an active dirty vault intact when a replacement candidate fails', async () => {
    const oldClient = fakeClient()
    const failedCreate = fakeClient({ open: vi.fn(async () => { throw new Error('candidate create failed') }) })
    const failedOpen = fakeClient({ open: vi.fn(async () => { throw new Error('candidate open failed') }) })
    const clients = [oldClient, failedCreate, failedOpen]
    const createClient = vi.fn(() => clients.shift() ?? failedOpen)
    const session = new VaultSession({
      createClient,
      encrypt: vi.fn(async () => new Uint8Array([4, 5])),
      download: vi.fn(),
    })
    await session.create('password-1')
    await expect(session.create('password-2')).rejects.toThrow('candidate create failed')
    expect(session.getSnapshot()).toMatchObject({ status: 'unlocked', dirty: true, lastExportAt: null })

    const key = await importPasswordKey('password-1')
    const file = await encryptSqliteBytes(new Uint8Array([1, 2, 3]), key, {
      iterations: 1_000,
      rng: (length: number): Uint8Array => new Uint8Array(length).fill(8),
    })
    await expect(session.open(file, 'password-1')).rejects.toThrow('candidate open failed')
    expect(session.getSnapshot()).toMatchObject({ status: 'unlocked', dirty: true, lastExportAt: null })
    await session.operation({ kind: 'months.list' })
    await session.save()
    expect(oldClient.operation).toHaveBeenCalled()
    expect(session.getSnapshot().dirty).toBe(false)
    await session.lock()
    expect(oldClient.close).toHaveBeenCalledOnce()
  })

  it('preserves the unsupported-version error separately from corruption', async () => {
    const key = await importPasswordKey('password-1')
    const file = await encryptSqliteBytes(new Uint8Array([1]), key, {
      iterations: 1_000,
      rng: (length: number): Uint8Array => new Uint8Array(length).fill(9),
    })
    file[5] = 2
    const session = new VaultSession({ createClient: () => fakeClient() })
    await expect(session.open(file, 'password-1')).rejects.toThrow(UNSUPPORTED_NIMVO_VERSION_MESSAGE)
    expect(session.getSnapshot().error).toBe(UNSUPPORTED_NIMVO_VERSION_MESSAGE)
  })

  it('writes the first selected target and overwrites that same target later', async () => {
    const target = fakeTarget('presupuesto.nimvo')
    const fileAccess = fakeFileAccess({ saveAs: vi.fn(async () => ({ name: target.name ?? 'presupuesto.nimvo', target })) })
    const write = fileAccess.write as ReturnType<typeof vi.fn>
    const saveAs = fileAccess.saveAs as ReturnType<typeof vi.fn>
    const session = new VaultSession({ createClient: () => fakeClient(), fileAccess, encrypt: vi.fn(async () => new Uint8Array([4])) as typeof encryptSqliteBytes })
    await session.create('password-1')

    const firstSave = session.saveToFile()
    expect(saveAs).toHaveBeenCalledOnce()
    await firstSave
    expect(write).toHaveBeenCalledOnce()
    expect(session.getSnapshot()).toMatchObject({ activeFileName: 'presupuesto.nimvo', dirty: false })
    await session.operation({ kind: 'months.create', year: 2026, month: 1, initialAmountCents: 1 })
    await session.saveToFile()
    expect(write).toHaveBeenCalledTimes(2)
    expect(write.mock.calls[1]?.[0]).toBe(target)
    expect(saveAs).toHaveBeenCalledOnce()
  })

  it('rebinds on saveAs and keeps the active target on saveCopy', async () => {
    const first = fakeTarget('primero.nimvo')
    const second = fakeTarget('segundo.nimvo')
    const saveAs = vi.fn()
      .mockResolvedValueOnce({ name: first.name, target: first })
      .mockResolvedValueOnce({ name: second.name, target: second })
    const download = vi.fn()
    const fileAccess = fakeFileAccess({ saveAs, write: vi.fn(async () => undefined) })
    const session = new VaultSession({ createClient: () => fakeClient(), fileAccess, download, encrypt: vi.fn(async () => new Uint8Array([5])) as typeof encryptSqliteBytes })
    await session.create('password-1')
    await session.saveToFile()
    await session.operation({ kind: 'months.create', year: 2026, month: 1, initialAmountCents: 1 })
    const rebindingSave = session.saveAs()
    expect(saveAs).toHaveBeenCalledTimes(2)
    await rebindingSave
    expect(session.getSnapshot().activeFileName).toBe('segundo.nimvo')
    await session.operation({ kind: 'months.create', year: 2026, month: 2, initialAmountCents: 1 })
    await session.saveCopy()
    expect(session.getSnapshot()).toMatchObject({ activeFileName: 'segundo.nimvo', dirty: false })
    expect(download).toHaveBeenCalledOnce()
  })

  it('keeps dirty and target state when picker or write is cancelled or fails', async () => {
    const target = fakeTarget('activo.nimvo')
    const fileAccess = fakeFileAccess({ saveAs: vi.fn(async () => null) })
    const session = new VaultSession({ createClient: () => fakeClient(), fileAccess, encrypt: vi.fn(async () => new Uint8Array([6])) as typeof encryptSqliteBytes })
    await session.create('password-1')
    const cancelledSave = session.saveToFile()
    expect(fileAccess.saveAs).toHaveBeenCalledOnce()
    expect(await cancelledSave).toBeNull()
    expect(session.getSnapshot().dirty).toBe(true)

    const linkedAccess = fakeFileAccess({
      saveAs: vi.fn(async () => ({ name: target.name ?? 'activo.nimvo', target })),
      write: vi.fn(async () => undefined),
    })
    const linked = new VaultSession({ createClient: () => fakeClient(), fileAccess: linkedAccess, encrypt: vi.fn(async () => new Uint8Array([7])) as typeof encryptSqliteBytes })
    await linked.create('password-1')
    await linked.saveToFile()
    const failedWrite = linkedAccess.write as ReturnType<typeof vi.fn>
    failedWrite.mockRejectedValueOnce(new Error('write failed'))
    await linked.operation({ kind: 'months.create', year: 2026, month: 1, initialAmountCents: 1 })
    await expect(linked.saveToFile()).rejects.toThrow('write failed')
    expect(linked.getSnapshot()).toMatchObject({ activeFileName: 'activo.nimvo', dirty: true })
  })

  it('commits a picker target only after authentication and opening succeed', async () => {
    const oldTarget = fakeTarget('viejo.nimvo')
    const nextTarget = fakeTarget('nuevo.nimvo')
    const key = await importPasswordKey('password-1')
    const validFile = await encryptSqliteBytes(new Uint8Array([1, 2, 3]), key, {
      iterations: 1_000,
      rng: (length: number): Uint8Array => new Uint8Array(length).fill(12),
    })
    let selection: VaultFileSelection | null = { bytes: new Uint8Array([0]), name: 'nuevo.nimvo', target: nextTarget }
    const fileAccess = fakeFileAccess({
      saveAs: vi.fn(async () => ({ name: oldTarget.name ?? 'viejo.nimvo', target: oldTarget })),
      open: vi.fn(async () => selection),
      write: vi.fn(async () => undefined),
    })
    const session = new VaultSession({ createClient: () => fakeClient(), fileAccess })
    await session.create('password-1')
    await session.saveToFile()
    const failedOpen = session.openFromPicker('wrong-password')
    expect(fileAccess.open).toHaveBeenCalledOnce()
    await expect(failedOpen).rejects.toThrow()
    expect(session.getSnapshot()).toMatchObject({ status: 'unlocked', activeFileName: 'viejo.nimvo' })

    selection = { bytes: validFile, name: 'nuevo.nimvo', target: nextTarget }
    const successfulOpen = session.openFromPicker('password-1')
    expect(fileAccess.open).toHaveBeenCalledTimes(2)
    await expect(successfulOpen).resolves.toBe(true)
    expect(session.getSnapshot()).toMatchObject({ status: 'unlocked', activeFileName: 'nuevo.nimvo', dirty: false })
  })

  it('does not link a legacy picker file for future overwrite', async () => {
    const target = fakeTarget('legado.moneo')
    const selection: VaultFileSelection = { bytes: await legacyFile('password-1'), name: 'legado.moneo', target }
    const fileAccess = fakeFileAccess({ open: vi.fn(async () => selection), saveAs: vi.fn(async () => null) })
    const session = new VaultSession({ createClient: () => fakeClient(), fileAccess })
    await expect(session.openFromPicker('password-1')).resolves.toBe(true)
    expect(session.getSnapshot()).toMatchObject({ status: 'unlocked', activeFileName: null, dirty: false })
    await session.operation({ kind: 'months.create', year: 2026, month: 1, initialAmountCents: 1 })
    await session.saveToFile()
    expect(fileAccess.saveAs).toHaveBeenCalledOnce()
  })

  it('clears the linked target when locking', async () => {
    const target = fakeTarget('activo.nimvo')
    const fileAccess = fakeFileAccess({ saveAs: vi.fn(async () => ({ name: target.name ?? 'activo.nimvo', target })) })
    const session = new VaultSession({ createClient: () => fakeClient(), fileAccess, encrypt: vi.fn(async () => new Uint8Array([8])) as typeof encryptSqliteBytes })
    await session.create('password-1')
    await session.saveToFile()
    await session.lock()
    expect(session.getSnapshot()).toMatchObject({ status: 'locked', activeFileName: null, dirty: false })
  })
})

describe('vault UI', () => {
  it('creates a vault from the validated form', async () => {
    const user = userEvent.setup()
    const session = new VaultSession({ createClient: () => fakeClient() })
    renderCreate(session)
    await user.type(screen.getByLabelText('Password'), 'password-1')
    await user.type(screen.getByLabelText('Confirm password'), 'password-1')
    await user.click(screen.getByRole('button', { name: 'Create vault' }))
    await waitFor(() => expect(session.getSnapshot().status).toBe('unlocked'))
  })

  it('installs beforeunload only while dirty', async () => {
    const session = new VaultSession({ createClient: () => fakeClient() })
    render(
      <ChakraProvider value={defaultSystem}>
        <VaultProvider session={session}><span>probe</span></VaultProvider>
      </ChakraProvider>,
    )
    await act(() => session.create('password-1'))
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)
    await act(() => session.lock())
    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)
  })
})
