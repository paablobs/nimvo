import { describe, expect, it, vi } from 'vitest'

import { ARGON2_MAX_MEMORY_KIB, ARGON2_MIN_MEMORY_KIB, deriveVaultKeys } from './argon2.ts'
import { NIMVO_V2_HEADER_LENGTH } from './container-v2.ts'
import {
  INVALID_NIMVO_FILE_MESSAGE,
  LEGACY_MONEO_MAGIC,
  NIMVO_HEADER_LENGTH,
  NIMVO_IV_LENGTH,
  NIMVO_SALT_LENGTH,
  NIMVO_VERSION,
  decryptNimvoFile,
  encryptSqliteBytes,
  importPasswordKey,
} from './index.ts'
import type { Kdf } from './kdf.ts'
import { createVaultKey, encryptVault, openVaultContainer, type VaultKey } from './vault.ts'
import { testKdf } from '../test/testKdf.ts'

const password = 'correct horse battery staple'
const data = new TextEncoder().encode('SQLite bytes, not necessarily text')

const spyKdf = (): Kdf & { derive: ReturnType<typeof vi.fn> } => {
  const derive = vi.fn(testKdf.derive)
  return { defaultParams: testKdf.defaultParams, derive }
}

const bytes = (value: Uint8Array): number[] => Array.from(value)

const seal = async (kdf: Kdf, input = data): Promise<{ file: Uint8Array; key: VaultKey }> => {
  const key = await createVaultKey(password, { kdf })
  return { file: await encryptVault(input, key), key }
}

const expectInvalid = (promise: Promise<unknown>) =>
  expect(promise).rejects.toMatchObject({ name: 'NimvoCryptoError', code: 'INVALID_FILE', message: INVALID_NIMVO_FILE_MESSAGE })

describe('Argon2id key derivation', () => {
  it('zeroes the password and returns non-extractable single-purpose keys', async () => {
    const pass = new TextEncoder().encode('secret')
    const keys = await deriveVaultKeys(pass, new Uint8Array(16).fill(1), testKdf.defaultParams)
    expect(pass.every((byte) => byte === 0)).toBe(true)
    expect(keys.encryptKey.extractable).toBe(false)
    expect(keys.encryptKey.usages).toEqual(['encrypt'])
    expect(keys.decryptKey.usages).toEqual(['decrypt'])
  })

  it('refuses parameters outside the allowed bounds', async () => {
    const salt = new Uint8Array(16)
    await expect(deriveVaultKeys(new Uint8Array(1), salt, { memoryKiB: ARGON2_MAX_MEMORY_KIB + 1, timeCost: 2, parallelism: 1 })).rejects.toThrow(RangeError)
    await expect(deriveVaultKeys(new Uint8Array(1), salt, { memoryKiB: ARGON2_MIN_MEMORY_KIB, timeCost: 1, parallelism: 1 })).rejects.toThrow(RangeError)
    await expect(deriveVaultKeys(new Uint8Array(1), salt, { memoryKiB: ARGON2_MIN_MEMORY_KIB, timeCost: 2, parallelism: 2 })).rejects.toThrow(RangeError)
  })
})

describe('Nimvo v2 container', () => {
  it('round-trips and reports the keys needed for the next save', async () => {
    const kdf = spyKdf()
    const { file } = await seal(kdf)
    expect(file[5]).toBe(2)
    expect(new TextDecoder().decode(file.subarray(0, 5))).toBe('NIMVO')
    const opened = await openVaultContainer(file, password, { kdf })
    expect(bytes(opened.plaintext)).toEqual(bytes(data))
    expect(opened).toMatchObject({ format: 'nimvo', sourceVersion: 2 })
    expect(opened.vaultKey.kind).toBe('argon2id')
  })

  it('does not mutate or retain the caller bytes', async () => {
    const kdf = spyKdf()
    const { file } = await seal(kdf)
    const copy = new Uint8Array(file)
    await openVaultContainer(file, password, { kdf })
    expect(bytes(file)).toEqual(bytes(copy))
  })

  it('keeps the salt and parameters per file but draws a fresh IV for every save', async () => {
    const kdf = spyKdf()
    const key = await createVaultKey(password, { kdf })
    const first = await encryptVault(data, key)
    const second = await encryptVault(data, key)
    const saltOf = (file: Uint8Array) => file.slice(NIMVO_V2_HEADER_LENGTH, NIMVO_V2_HEADER_LENGTH + NIMVO_SALT_LENGTH)
    const ivOf = (file: Uint8Array) => file.slice(NIMVO_V2_HEADER_LENGTH + NIMVO_SALT_LENGTH, NIMVO_V2_HEADER_LENGTH + NIMVO_SALT_LENGTH + NIMVO_IV_LENGTH)
    expect(saltOf(first)).toEqual(saltOf(second))
    expect(ivOf(first)).not.toEqual(ivOf(second))
    expect(first.slice(NIMVO_V2_HEADER_LENGTH + 28)).not.toEqual(second.slice(NIMVO_V2_HEADER_LENGTH + 28))
    // Derivation happens once per key, never per save.
    expect(kdf.derive).toHaveBeenCalledTimes(1)
  })

  it('rejects a wrong password with the generic error', async () => {
    const kdf = spyKdf()
    const { file } = await seal(kdf)
    await expectInvalid(openVaultContainer(file, 'not the password', { kdf }))
  })

  it('rejects truncation and any altered header or ciphertext byte', async () => {
    const kdf = spyKdf()
    const { file } = await seal(kdf)
    await expectInvalid(openVaultContainer(file.slice(0, file.length - 1), password, { kdf }))
    await expectInvalid(openVaultContainer(file.slice(0, 10), password, { kdf }))
    const tamperable = [6, 7, 10, 11, 13, 14, 18, NIMVO_V2_HEADER_LENGTH, NIMVO_V2_HEADER_LENGTH + NIMVO_SALT_LENGTH, file.length - 1]
    for (const index of tamperable) {
      const altered = new Uint8Array(file)
      altered[index] ^= 1
      await expectInvalid(openVaultContainer(altered, password, { kdf }))
    }
  })

  it('authenticates the Argon2id parameters even when the altered values are in bounds', async () => {
    const kdf = spyKdf()
    const { file } = await seal(kdf)
    const altered = new Uint8Array(file)
    altered[11] = altered[11] + 1 // time cost 2 -> 3, still a legal value
    await expectInvalid(openVaultContainer(altered, password, { kdf }))
  })

  it('checks the header bounds before any key derivation', async () => {
    const kdf = spyKdf()
    const { file } = await seal(kdf)
    kdf.derive.mockClear()
    const view = (bytes: Uint8Array) => new DataView(bytes.buffer)
    const cases: Array<(bytes: Uint8Array) => void> = [
      (bytes) => view(bytes).setUint32(7, ARGON2_MAX_MEMORY_KIB + 1),
      (bytes) => view(bytes).setUint32(7, 0xffffffff),
      (bytes) => view(bytes).setUint32(7, ARGON2_MIN_MEMORY_KIB - 1),
      (bytes) => { bytes[11] = 1 },
      (bytes) => { bytes[11] = 11 },
      (bytes) => { bytes[12] = 2 },
      (bytes) => { bytes[13] = 15 },
      (bytes) => { bytes[14] = 13 },
      (bytes) => view(bytes).setUint32(15, 0xffffffff),
      (bytes) => { bytes[6] = 1 },
      (bytes) => bytes.set(new TextEncoder().encode(LEGACY_MONEO_MAGIC), 0),
    ]
    for (const mutate of cases) {
      const altered = new Uint8Array(file)
      mutate(altered)
      await expectInvalid(openVaultContainer(altered, password, { kdf }))
    }
    expect(kdf.derive).not.toHaveBeenCalled()
  })

  it('reports newer container versions as unsupported', async () => {
    const kdf = spyKdf()
    const { file } = await seal(kdf)
    kdf.derive.mockClear()
    file[5] = 3
    await expect(openVaultContainer(file, password, { kdf })).rejects.toMatchObject({ code: 'UNSUPPORTED_VERSION' })
    expect(kdf.derive).not.toHaveBeenCalled()
  })
})

/** A version 1 container written with the legacy `.moneo` magic (authenticated header included). */
async function legacyFile(): Promise<Uint8Array> {
  const iterations = 1_000
  const passwordKey = await importPasswordKey(password)
  const salt = new Uint8Array(NIMVO_SALT_LENGTH).fill(4)
  const iv = new Uint8Array(NIMVO_IV_LENGTH).fill(5)
  const ciphertextLength = data.length + 16
  const header = new Uint8Array(NIMVO_HEADER_LENGTH + salt.length + iv.length)
  header.set(new TextEncoder().encode(LEGACY_MONEO_MAGIC), 0)
  header[5] = NIMVO_VERSION
  header[6] = 1
  header[7] = 1
  new DataView(header.buffer).setUint32(8, iterations)
  header[12] = salt.length
  header[13] = iv.length
  new DataView(header.buffer).setUint32(14, ciphertextLength)
  header.set(salt, NIMVO_HEADER_LENGTH)
  header.set(iv, NIMVO_HEADER_LENGTH + salt.length)
  const derived = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, passwordKey, 256)
  const aesKey = await globalThis.crypto.subtle.importKey('raw', derived, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header, tagLength: 128 }, aesKey, data))
  const file = new Uint8Array(header.length + ciphertext.length)
  file.set(header)
  file.set(ciphertext, header.length)
  return file
}

describe('upgrading from version 1', () => {
  const v1File = async (): Promise<Uint8Array> =>
    encryptSqliteBytes(data, await importPasswordKey(password), { iterations: 1_000 })

  it('opens a v1 file, then writes the next save as v2 that reopens', async () => {
    const kdf = spyKdf()
    const opened = await openVaultContainer(await v1File(), password, { kdf })
    expect(opened).toMatchObject({ format: 'nimvo', sourceVersion: 1 })
    expect(bytes(opened.plaintext)).toEqual(bytes(data))
    expect(opened.vaultKey.kind).toBe('argon2id')

    const saved = await encryptVault(opened.plaintext, opened.vaultKey)
    expect(saved[5]).toBe(2)
    const reopened = await openVaultContainer(saved, password, { kdf })
    expect(bytes(reopened.plaintext)).toEqual(bytes(data))
    expect(reopened.sourceVersion).toBe(2)
  })

  it('rejects a wrong password on a v1 file without deriving an Argon2id key', async () => {
    const kdf = spyKdf()
    await expectInvalid(openVaultContainer(await v1File(), 'wrong', { kdf }))
    expect(kdf.derive).not.toHaveBeenCalled()
  })

  it('treats a legacy .moneo import as legacy and saves it as a v2 .nimvo', async () => {
    const kdf = spyKdf()
    const opened = await openVaultContainer(await legacyFile(), password, { kdf })
    expect(opened).toMatchObject({ format: 'legacy', sourceVersion: 1 })
    expect(bytes(opened.plaintext)).toEqual(bytes(data))
    const saved = await encryptVault(opened.plaintext, opened.vaultKey)
    expect(new TextDecoder().decode(saved.subarray(0, 5))).toBe('NIMVO')
    expect(saved[5]).toBe(2)
    expect((await openVaultContainer(saved, password, { kdf })).format).toBe('nimvo')
  })
})

describe('writing the previous format', () => {
  it('can keep writing v1 files that older versions read, from a new or a v2 vault', async () => {
    const kdf = spyKdf()
    const created = await createVaultKey(password, { kdf, formatVersion: 1 })
    expect(created.kind).toBe('pbkdf2')
    const v1 = await encryptVault(data, created)
    expect(v1[5]).toBe(NIMVO_VERSION)
    expect(bytes((await decryptNimvoFile(v1, password)).plaintext)).toEqual(bytes(data))

    const { file } = await seal(kdf)
    const opened = await openVaultContainer(file, password, { kdf, formatVersion: 1 })
    expect(opened.vaultKey.kind).toBe('pbkdf2')
    const rewritten = await encryptVault(opened.plaintext, opened.vaultKey)
    expect(rewritten[5]).toBe(NIMVO_VERSION)
    expect(bytes((await decryptNimvoFile(rewritten, password)).plaintext)).toEqual(bytes(data))
  })
})
