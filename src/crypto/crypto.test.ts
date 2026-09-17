import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PBKDF2_ITERATIONS,
  INVALID_MONEO_FILE_MESSAGE,
  MONEO_HEADER_LENGTH,
  MONEO_IV_LENGTH,
  MONEO_SALT_LENGTH,
  MONEO_VERSION,
  MAX_PBKDF2_ITERATIONS,
  MoneoCryptoError,
  decryptMoneoFile,
  decryptMoneoFileWithPasswordKey,
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
    name: 'MoneoCryptoError',
    code: 'INVALID_FILE',
    message: INVALID_MONEO_FILE_MESSAGE,
  })
}

describe('Moneo crypto container', () => {
  it('encrypts and decrypts without mutating caller bytes', async () => {
    const input = new Uint8Array(data)
    const before = new Uint8Array(input)
    const container = await encrypted(input)
    expect(input).toEqual(before)

    const result = await decryptMoneoFile(container, password)
    expect(Array.from(result.plaintext)).toEqual(Array.from(data))
    expect(result.metadata.version).toBe(MONEO_VERSION)
    expect(result.metadata.iterations).toBe(ITERATIONS)
    expect(result.metadata.salt).toHaveLength(MONEO_SALT_LENGTH)
    expect(result.metadata.iv).toHaveLength(MONEO_IV_LENGTH)
    expect(result.passwordKey.extractable).toBe(false)
    await expect(globalThis.crypto.subtle.exportKey('raw', result.passwordKey)).rejects.toThrow()
  })

  it('supports decrypting with a previously imported password key', async () => {
    const key = await importPasswordKey(password)
    const container = await encryptSqliteBytes(data, key, ITERATIONS, deterministicRng)
    const result = await decryptMoneoFileWithPasswordKey(container, key)
    expect(Array.from(result.plaintext)).toEqual(Array.from(data))
  })

  it('rejects a wrong password with the public authentication error', async () => {
    await expectInvalidFile(decryptMoneoFile(await encrypted(), 'wrong password'))
  })

  it('rejects truncation, altered headers, ciphertext, and tags uniformly', async () => {
    const container = await encrypted()
    await expectInvalidFile(decryptMoneoFile(container.slice(0, -1), password))

    const alteredHeader = new Uint8Array(container)
    alteredHeader[8] ^= 1
    await expectInvalidFile(decryptMoneoFile(alteredHeader, password))

    const alteredCiphertext = new Uint8Array(container)
    alteredCiphertext[MONEO_HEADER_LENGTH + MONEO_SALT_LENGTH + MONEO_IV_LENGTH] ^= 1
    await expectInvalidFile(decryptMoneoFile(alteredCiphertext, password))

    const alteredTag = new Uint8Array(container)
    alteredTag[alteredTag.length - 1] ^= 1
    await expectInvalidFile(decryptMoneoFile(alteredTag, password))
  })

  it('reports an unsupported version separately', async () => {
    const container = await encrypted()
    container[5] = MONEO_VERSION + 1
    await expect(decryptMoneoFile(container, password)).rejects.toMatchObject({
      name: 'MoneoCryptoError',
      code: 'UNSUPPORTED_VERSION',
      message: 'Versión de archivo no soportada',
    })
  })

  it('validates magic, lengths, and KDF iteration bounds before decrypting', async () => {
    const container = await encrypted()

    const badMagic = new Uint8Array(container)
    badMagic[0] ^= 1
    await expectInvalidFile(decryptMoneoFile(badMagic, password))

    const badSaltLength = new Uint8Array(container)
    badSaltLength[12] = 1
    await expectInvalidFile(decryptMoneoFile(badSaltLength, password))

    const badCiphertextLength = new Uint8Array(container)
    badCiphertextLength[17] = 0
    await expectInvalidFile(decryptMoneoFile(badCiphertextLength, password))

    const badIterations = new Uint8Array(container)
    badIterations[8] = 0xff
    badIterations[9] = 0xff
    badIterations[10] = 0xff
    badIterations[11] = 0xff
    await expectInvalidFile(decryptMoneoFile(badIterations, password))

    expect(DEFAULT_PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(ITERATIONS)
    expect(MAX_PBKDF2_ITERATIONS).toBeGreaterThan(DEFAULT_PBKDF2_ITERATIONS)
  })

  it('generates fresh salts and IVs for each encryption', async () => {
    const key = await importPasswordKey(password)
    const first = await encryptSqliteBytes(data, key, { iterations: ITERATIONS })
    const second = await encryptSqliteBytes(data, key, { iterations: ITERATIONS })
    expect(first.slice(MONEO_HEADER_LENGTH, MONEO_HEADER_LENGTH + MONEO_SALT_LENGTH)).not.toEqual(
      second.slice(MONEO_HEADER_LENGTH, MONEO_HEADER_LENGTH + MONEO_SALT_LENGTH),
    )
    expect(
      first.slice(MONEO_HEADER_LENGTH + MONEO_SALT_LENGTH, MONEO_HEADER_LENGTH + MONEO_SALT_LENGTH + MONEO_IV_LENGTH),
    ).not.toEqual(
      second.slice(MONEO_HEADER_LENGTH + MONEO_SALT_LENGTH, MONEO_HEADER_LENGTH + MONEO_SALT_LENGTH + MONEO_IV_LENGTH),
    )
  })

  it('handles a large byte payload', async () => {
    const large = new Uint8Array(1024 * 1024)
    large.fill(0xa5)
    const result = await decryptMoneoFile(await encrypted(large), password)
    expect(Array.from(result.plaintext)).toEqual(Array.from(large))
  })

  it('exposes the typed error class', async () => {
    const container = await encrypted()
    container[12] = 0
    try {
      await decryptMoneoFile(container, password)
      throw new Error('expected rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(MoneoCryptoError)
    }
  })
})
