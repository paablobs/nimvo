import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PBKDF2_ITERATIONS,
  LEGACY_MONEO_MAGIC,
  INVALID_NIMVO_FILE_MESSAGE,
  NIMVO_HEADER_LENGTH,
  NIMVO_IV_LENGTH,
  NIMVO_SALT_LENGTH,
  NIMVO_VERSION,
  MAX_PBKDF2_ITERATIONS,
  NimvoCryptoError,
  decryptNimvoFile,
  decryptNimvoFileWithPasswordKey,
  encryptSqliteBytes,
  importPasswordKey,
} from './index'

const ITERATIONS = 1_000
const password = 'correct horse battery staple'
const data = new TextEncoder().encode('SQLite bytes, not necessarily text')

const deterministicRng = (length: number): Uint8Array =>
  new Uint8Array(Array.from({ length }, (_, index) => (index + 1) & 0xff))

const encrypted = async (input = data): Promise<Uint8Array> => {
  const key = await importPasswordKey(password)
  return encryptSqliteBytes(input, key, { iterations: ITERATIONS, rng: deterministicRng })
}

const expectInvalidFile = async (promise: Promise<unknown>): Promise<void> => {
  await expect(promise).rejects.toMatchObject({
    name: 'NimvoCryptoError',
    code: 'INVALID_FILE',
    message: INVALID_NIMVO_FILE_MESSAGE,
  })
}

async function legacyEncrypted(input = data): Promise<Uint8Array> {
  const passwordKey = await importPasswordKey(password)
  const salt = new Uint8Array(NIMVO_SALT_LENGTH).fill(4)
  const iv = new Uint8Array(NIMVO_IV_LENGTH).fill(5)
  const ciphertextLength = input.length + 16
  const header = new Uint8Array(NIMVO_HEADER_LENGTH + salt.length + iv.length)
  header.set(new TextEncoder().encode(LEGACY_MONEO_MAGIC), 0)
  header[5] = NIMVO_VERSION
  header[6] = 1
  header[7] = 1
  new DataView(header.buffer).setUint32(8, ITERATIONS)
  header[12] = salt.length
  header[13] = iv.length
  new DataView(header.buffer).setUint32(14, ciphertextLength)
  header.set(salt, NIMVO_HEADER_LENGTH)
  header.set(iv, NIMVO_HEADER_LENGTH + salt.length)
  const derived = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt.buffer, iterations: ITERATIONS, hash: 'SHA-256' },
    passwordKey,
    256,
  )
  const aesKey = await globalThis.crypto.subtle.importKey('raw', derived, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const ciphertext = new Uint8Array(await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer, additionalData: header.buffer, tagLength: 128 },
    aesKey,
    input.buffer,
  ))
  const result = new Uint8Array(header.length + ciphertext.length)
  result.set(header)
  result.set(ciphertext, header.length)
  return result
}

describe('Nimvo crypto container', () => {
  it('encrypts and decrypts without mutating caller bytes', async () => {
    const input = new Uint8Array(data)
    const before = new Uint8Array(input)
    const container = await encrypted(input)
    expect(input).toEqual(before)
    expect(new TextDecoder().decode(container.slice(0, 5))).toBe('NIMVO')

    const result = await decryptNimvoFile(container, password)
    expect(Array.from(result.plaintext)).toEqual(Array.from(data))
    expect(result.metadata.version).toBe(NIMVO_VERSION)
    expect(result.metadata.format).toBe('nimvo')
    expect(result.metadata.iterations).toBe(ITERATIONS)
    expect(result.metadata.salt).toHaveLength(NIMVO_SALT_LENGTH)
    expect(result.metadata.iv).toHaveLength(NIMVO_IV_LENGTH)
    expect(result.passwordKey.extractable).toBe(false)
    await expect(globalThis.crypto.subtle.exportKey('raw', result.passwordKey)).rejects.toThrow()
  })

  it('supports decrypting with a previously imported password key', async () => {
    const key = await importPasswordKey(password)
    const container = await encryptSqliteBytes(data, key, ITERATIONS, deterministicRng)
    const result = await decryptNimvoFileWithPasswordKey(container, key)
    expect(Array.from(result.plaintext)).toEqual(Array.from(data))
  })

  it('decrypts legacy Moneo containers while preserving their format metadata', async () => {
    const result = await decryptNimvoFile(await legacyEncrypted(), password)
    expect(result.metadata.format).toBe('legacy')
    expect(Array.from(result.plaintext)).toEqual(Array.from(data))
  })

  it('rejects a wrong password with the public authentication error', async () => {
    await expectInvalidFile(decryptNimvoFile(await encrypted(), 'wrong password'))
  })

  it('rejects truncation, altered headers, ciphertext, and tags uniformly', async () => {
    const container = await encrypted()
    await expectInvalidFile(decryptNimvoFile(container.slice(0, -1), password))

    const alteredHeader = new Uint8Array(container)
    alteredHeader[8] ^= 1
    await expectInvalidFile(decryptNimvoFile(alteredHeader, password))

    const alteredCiphertext = new Uint8Array(container)
    alteredCiphertext[NIMVO_HEADER_LENGTH + NIMVO_SALT_LENGTH + NIMVO_IV_LENGTH] ^= 1
    await expectInvalidFile(decryptNimvoFile(alteredCiphertext, password))

    const alteredTag = new Uint8Array(container)
    alteredTag[alteredTag.length - 1] ^= 1
    await expectInvalidFile(decryptNimvoFile(alteredTag, password))
  })

  it('reports an unsupported version separately', async () => {
    const container = await encrypted()
    container[5] = NIMVO_VERSION + 1
    await expect(decryptNimvoFile(container, password)).rejects.toMatchObject({
      name: 'NimvoCryptoError',
      code: 'UNSUPPORTED_VERSION',
      message: 'Versión de archivo no soportada',
    })
  })

  it('validates magic, lengths, and KDF iteration bounds before decrypting', async () => {
    const container = await encrypted()

    const badMagic = new Uint8Array(container)
    badMagic[0] ^= 1
    await expectInvalidFile(decryptNimvoFile(badMagic, password))

    const badSaltLength = new Uint8Array(container)
    badSaltLength[12] = 1
    await expectInvalidFile(decryptNimvoFile(badSaltLength, password))

    const badCiphertextLength = new Uint8Array(container)
    badCiphertextLength[17] = 0
    await expectInvalidFile(decryptNimvoFile(badCiphertextLength, password))

    const badIterations = new Uint8Array(container)
    badIterations[8] = 0xff
    badIterations[9] = 0xff
    badIterations[10] = 0xff
    badIterations[11] = 0xff
    await expectInvalidFile(decryptNimvoFile(badIterations, password))

    expect(DEFAULT_PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(ITERATIONS)
    expect(MAX_PBKDF2_ITERATIONS).toBeGreaterThan(DEFAULT_PBKDF2_ITERATIONS)
  })

  it('generates fresh salts and IVs for each encryption', async () => {
    const key = await importPasswordKey(password)
    const first = await encryptSqliteBytes(data, key, { iterations: ITERATIONS })
    const second = await encryptSqliteBytes(data, key, { iterations: ITERATIONS })
    expect(first.slice(NIMVO_HEADER_LENGTH, NIMVO_HEADER_LENGTH + NIMVO_SALT_LENGTH)).not.toEqual(
      second.slice(NIMVO_HEADER_LENGTH, NIMVO_HEADER_LENGTH + NIMVO_SALT_LENGTH),
    )
    expect(
      first.slice(NIMVO_HEADER_LENGTH + NIMVO_SALT_LENGTH, NIMVO_HEADER_LENGTH + NIMVO_SALT_LENGTH + NIMVO_IV_LENGTH),
    ).not.toEqual(
      second.slice(NIMVO_HEADER_LENGTH + NIMVO_SALT_LENGTH, NIMVO_HEADER_LENGTH + NIMVO_SALT_LENGTH + NIMVO_IV_LENGTH),
    )
  })

  it('handles a large byte payload', async () => {
    const large = new Uint8Array(1024 * 1024)
    large.fill(0xa5)
    const result = await decryptNimvoFile(await encrypted(large), password)
    expect(Array.from(result.plaintext)).toEqual(Array.from(large))
  })

  it('exposes the typed error class', async () => {
    const container = await encrypted()
    container[12] = 0
    try {
      await decryptNimvoFile(container, password)
      throw new Error('expected rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(NimvoCryptoError)
    }
  })
})
