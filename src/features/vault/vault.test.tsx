import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { VaultProvider } from './VaultProvider.tsx'
import { VaultSession, type DatabaseClientLike } from './VaultSession.ts'
import CreateVaultPage from './CreateVaultPage.tsx'
import {
  encryptSqliteBytes,
  importPasswordKey,
  INVALID_MONEO_FILE_MESSAGE,
  UNSUPPORTED_MONEO_VERSION_MESSAGE,
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
    expect(session.getSnapshot()).toMatchObject({ status: 'error', error: INVALID_MONEO_FILE_MESSAGE })
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
    await expect(session.open(file, 'password-1')).rejects.toThrow(UNSUPPORTED_MONEO_VERSION_MESSAGE)
    expect(session.getSnapshot().error).toBe(UNSUPPORTED_MONEO_VERSION_MESSAGE)
  })
})

describe('vault UI', () => {
  it('creates a vault from the validated form', async () => {
    const user = userEvent.setup()
    const session = new VaultSession({ createClient: () => fakeClient() })
    renderCreate(session)
    await user.type(screen.getByLabelText('Contraseña'), 'password-1')
    await user.type(screen.getByLabelText('Confirmar contraseña'), 'password-1')
    await user.click(screen.getByRole('button', { name: 'Crear bóveda' }))
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
