/**
 * Nimvo encrypted-file container.
 *
 * Binary layout (all integer fields are unsigned big-endian):
 *
 *   magic[5] | version[1] | kdf[1] | hash[1] | iterations[4]
 *   | saltLength[1] | ivLength[1] | ciphertextLength[4]
 *   | salt[saltLength] | iv[ivLength] | ciphertext[ciphertextLength]
 *
 * The complete fixed and variable header, through the IV, is authenticated as
 * AES-GCM additional authenticated data. The ciphertext includes the 128-bit
 * GCM authentication tag appended by Web Crypto.
 */

const textEncoder = new TextEncoder()

export const NIMVO_MAGIC = 'NIMVO'
export const LEGACY_MONEO_MAGIC = 'MONEO'
export const NIMVO_VERSION = 1
export const NIMVO_KDF_ID = 1
export const NIMVO_HASH_ID = 1
export const NIMVO_SALT_LENGTH = 16
export const NIMVO_IV_LENGTH = 12
export const NIMVO_GCM_TAG_LENGTH = 16
export const NIMVO_HEADER_LENGTH = 18

// Measured on the reference environment on 2026-09-17: about 247 ms in
// Chromium and 330 ms in Firefox. The value is stored in every v1 header.
export const DEFAULT_PBKDF2_ITERATIONS = 1_800_000
export const MIN_PBKDF2_ITERATIONS = 1_000
export const MAX_PBKDF2_ITERATIONS = 2_000_000

// Avoid allocating attacker-controlled amounts of memory while parsing.
export const MAX_CIPHERTEXT_LENGTH = 128 * 1024 * 1024

export const INVALID_NIMVO_FILE_MESSAGE = 'Contraseña incorrecta o archivo dañado'
export const UNSUPPORTED_NIMVO_VERSION_MESSAGE = 'Versión de archivo no soportada'

export type NimvoErrorCode = 'INVALID_FILE' | 'UNSUPPORTED_VERSION'

export class NimvoCryptoError extends Error {
  readonly code: NimvoErrorCode

  constructor(code: NimvoErrorCode) {
    super(code === 'UNSUPPORTED_VERSION' ? UNSUPPORTED_NIMVO_VERSION_MESSAGE : INVALID_NIMVO_FILE_MESSAGE)
    this.name = 'NimvoCryptoError'
    this.code = code
  }
}

export type RandomSource =
  | ((length: number) => Uint8Array)
  | ((target: Uint8Array) => Uint8Array | void)

export interface EncryptOptions {
  iterations?: number
  rng?: RandomSource
}

export type NimvoFormat = 'nimvo' | 'legacy'

export interface NimvoMetadata {
  format: NimvoFormat
  version: number
  kdfId: number
  hashId: number
  iterations: number
  salt: Uint8Array
  iv: Uint8Array
  ciphertextLength: number
}

export interface DecryptedNimvoFile {
  plaintext: Uint8Array
  passwordKey: CryptoKey
  metadata: NimvoMetadata
}

interface ParsedContainer {
  header: Uint8Array
  salt: Uint8Array
  iv: Uint8Array
  ciphertext: Uint8Array
  metadata: NimvoMetadata
}

const invalidFile = (): NimvoCryptoError => new NimvoCryptoError('INVALID_FILE')

const getCrypto = (): Crypto => {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) {
    throw new Error('Web Crypto API no disponible')
  }
  return cryptoApi
}

const isUint8Array = (value: unknown): value is Uint8Array => {
  if (!value || typeof value !== 'object' || !ArrayBuffer.isView(value)) return false
  const view = value as Uint8Array
  return view.constructor.name === 'Uint8Array' && view.byteLength === view.length
}

const asBytesCopy = (value: Uint8Array | ArrayBuffer): Uint8Array => {
  if (isUint8Array(value)) return new Uint8Array(value)
  return new Uint8Array(value.slice(0))
}

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  // Every internal byte array passed here is a fresh, tightly-sized copy. A
  // view is never transferred, so the caller's buffer cannot be detached.
  return bytes.buffer as ArrayBuffer
}

const writeU32 = (target: Uint8Array, offset: number, value: number): void => {
  target[offset] = (value >>> 24) & 0xff
  target[offset + 1] = (value >>> 16) & 0xff
  target[offset + 2] = (value >>> 8) & 0xff
  target[offset + 3] = value & 0xff
}

const readU32 = (source: Uint8Array, offset: number): number =>
  source[offset] * 0x1000000 +
  source[offset + 1] * 0x10000 +
  source[offset + 2] * 0x100 +
  source[offset + 3]

const validateIterations = (iterations: number): void => {
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new RangeError(`PBKDF2 iterations must be between ${MIN_PBKDF2_ITERATIONS} and ${MAX_PBKDF2_ITERATIONS}`)
  }
}

const randomBytes = (length: number, source?: RandomSource): Uint8Array => {
  if (!source) {
    const bytes = new Uint8Array(length)
    getCrypto().getRandomValues(bytes)
    return bytes
  }

  // Accept both a size-based test generator and the Web Crypto-style
  // (Uint8Array) callback. The first form is the documented API; the fallback
  // keeps crypto.getRandomValues convenient to pass in tests.
  let firstError: unknown
  try {
    const result = (source as (value: number) => unknown)(length)
    if (isUint8Array(result)) {
      if (result.length !== length) throw new RangeError('Random source returned an invalid length')
      return new Uint8Array(result)
    }
    if (result !== undefined) throw new TypeError('Random source must return Uint8Array')
  } catch (error) {
    firstError = error
  }

  const target = new Uint8Array(length)
  try {
    const result = (source as (value: Uint8Array) => unknown)(target)
    if (isUint8Array(result)) {
      if (result.length !== length) throw new RangeError('Random source returned an invalid length')
      return new Uint8Array(result)
    }
    if (result !== undefined) throw new TypeError('Random source must return Uint8Array')
    return target
  } catch (error) {
    throw firstError ?? error
  }
}

const deriveAesKey = async (
  passwordKey: CryptoKey,
  salt: Uint8Array,
  iterations: number,
  usages: KeyUsage[],
): Promise<CryptoKey> => {
  const cryptoApi = getCrypto()
  let derivedBits: ArrayBuffer | undefined
  try {
    derivedBits = await cryptoApi.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: asArrayBuffer(salt),
        iterations,
        hash: 'SHA-256',
      },
      passwordKey,
      256,
    )
    return await cryptoApi.subtle.importKey(
      'raw',
      derivedBits,
      { name: 'AES-GCM', length: 256 },
      false,
      usages,
    )
  } finally {
    if (derivedBits) new Uint8Array(derivedBits).fill(0)
  }
}

/** Import a password as a non-extractable PBKDF2 base key. */
export const importPasswordKey = async (password: string): Promise<CryptoKey> => {
  if (typeof password !== 'string') throw new TypeError('Password must be a string')
  const passwordBytes = textEncoder.encode(password)
  try {
    return await getCrypto().subtle.importKey(
      'raw',
      asArrayBuffer(passwordBytes),
      { name: 'PBKDF2' },
      false,
      ['deriveBits'],
    )
  } finally {
    passwordBytes.fill(0)
  }
}

// Short aliases for callers that prefer key-oriented naming.
export const createPasswordKey = importPasswordKey
export const importPassword = importPasswordKey
export const passwordToKey = importPasswordKey

const normalizeEncryptOptions = (
  optionsOrIterations?: number | EncryptOptions,
  randomSource?: RandomSource,
): Required<Pick<EncryptOptions, 'iterations'>> & { rng?: RandomSource } => {
  if (typeof optionsOrIterations === 'number') {
    return { iterations: optionsOrIterations, rng: randomSource }
  }
  return {
    iterations: optionsOrIterations?.iterations ?? DEFAULT_PBKDF2_ITERATIONS,
    rng: optionsOrIterations?.rng ?? randomSource,
  }
}

const makeHeader = (iterations: number, ciphertextLength: number, salt: Uint8Array, iv: Uint8Array): Uint8Array => {
  const header = new Uint8Array(NIMVO_HEADER_LENGTH + salt.length + iv.length)
  header.set(textEncoder.encode(NIMVO_MAGIC), 0)
  header[5] = NIMVO_VERSION
  header[6] = NIMVO_KDF_ID
  header[7] = NIMVO_HASH_ID
  writeU32(header, 8, iterations)
  header[12] = salt.length
  header[13] = iv.length
  writeU32(header, 14, ciphertextLength)
  header.set(salt, NIMVO_HEADER_LENGTH)
  header.set(iv, NIMVO_HEADER_LENGTH + salt.length)
  return header
}

/** Encrypt SQLite bytes into a Nimvo v1 container. */
export async function encryptSqliteBytes(
  plaintext: Uint8Array | ArrayBuffer,
  passwordKey: CryptoKey,
  optionsOrIterations?: number | EncryptOptions,
  randomSource?: RandomSource,
): Promise<Uint8Array> {
  const options = normalizeEncryptOptions(optionsOrIterations, randomSource)
  validateIterations(options.iterations)

  const plaintextCopy = asBytesCopy(plaintext)
  const salt = randomBytes(NIMVO_SALT_LENGTH, options.rng)
  const iv = randomBytes(NIMVO_IV_LENGTH, options.rng)
  const ciphertextLength = plaintextCopy.length + NIMVO_GCM_TAG_LENGTH
  if (ciphertextLength > MAX_CIPHERTEXT_LENGTH) {
    plaintextCopy.fill(0)
    salt.fill(0)
    iv.fill(0)
    throw new RangeError('Plaintext is too large')
  }

  let ciphertextBuffer: ArrayBuffer | undefined
  let header: Uint8Array | undefined
  try {
    header = makeHeader(options.iterations, ciphertextLength, salt, iv)
    const aesKey = await deriveAesKey(passwordKey, salt, options.iterations, ['encrypt'])
    ciphertextBuffer = await getCrypto().subtle.encrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(iv), additionalData: asArrayBuffer(header), tagLength: 128 },
      aesKey,
      asArrayBuffer(plaintextCopy),
    )
    const ciphertext = new Uint8Array(ciphertextBuffer)
    if (ciphertext.length !== ciphertextLength) throw new Error('Unexpected AES-GCM ciphertext length')
    const container = new Uint8Array(header.length + ciphertext.length)
    container.set(header)
    container.set(ciphertext, header.length)
    return container
  } finally {
    plaintextCopy.fill(0)
    salt.fill(0)
    iv.fill(0)
    header?.fill(0)
    if (ciphertextBuffer) new Uint8Array(ciphertextBuffer).fill(0)
  }
}

const parseContainer = (container: Uint8Array | ArrayBuffer): ParsedContainer => {
  const bytes = asBytesCopy(container)
  try {
    if (bytes.length < NIMVO_HEADER_LENGTH) throw invalidFile()

    const magic = new TextDecoder().decode(bytes.subarray(0, NIMVO_MAGIC.length))
    if (magic !== NIMVO_MAGIC && magic !== LEGACY_MONEO_MAGIC) throw invalidFile()

    const version = bytes[5]
    if (version !== NIMVO_VERSION) throw new NimvoCryptoError('UNSUPPORTED_VERSION')

    const kdfId = bytes[6]
    const hashId = bytes[7]
    const iterations = readU32(bytes, 8)
    const saltLength = bytes[12]
    const ivLength = bytes[13]
    const ciphertextLength = readU32(bytes, 14)
    if (
      kdfId !== NIMVO_KDF_ID ||
      hashId !== NIMVO_HASH_ID ||
      saltLength !== NIMVO_SALT_LENGTH ||
      ivLength !== NIMVO_IV_LENGTH ||
      ciphertextLength < NIMVO_GCM_TAG_LENGTH ||
      ciphertextLength > MAX_CIPHERTEXT_LENGTH ||
      !Number.isInteger(iterations) ||
      iterations < MIN_PBKDF2_ITERATIONS ||
      iterations > MAX_PBKDF2_ITERATIONS
    ) {
      throw invalidFile()
    }

    const expectedLength = NIMVO_HEADER_LENGTH + saltLength + ivLength + ciphertextLength
    if (expectedLength !== bytes.length) throw invalidFile()

    const headerLength = NIMVO_HEADER_LENGTH + saltLength + ivLength
    const header = bytes.slice(0, headerLength)
    const salt = bytes.slice(NIMVO_HEADER_LENGTH, NIMVO_HEADER_LENGTH + saltLength)
    const iv = bytes.slice(NIMVO_HEADER_LENGTH + saltLength, headerLength)
    const ciphertext = bytes.slice(headerLength)
    return {
      header,
      salt,
      iv,
      ciphertext,
      metadata: { format: magic === NIMVO_MAGIC ? 'nimvo' : 'legacy', version, kdfId, hashId, iterations, salt: new Uint8Array(salt), iv: new Uint8Array(iv), ciphertextLength },
    }
  } finally {
    bytes.fill(0)
  }
}

const decryptParsed = async (parsed: ParsedContainer, passwordKey: CryptoKey): Promise<Uint8Array> => {
  let plaintextBuffer: ArrayBuffer | undefined
  try {
    const aesKey = await deriveAesKey(passwordKey, parsed.salt, parsed.metadata.iterations, ['decrypt'])
    plaintextBuffer = await getCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(parsed.iv), additionalData: asArrayBuffer(parsed.header), tagLength: 128 },
      aesKey,
      asArrayBuffer(parsed.ciphertext),
    )
    const plaintext = new Uint8Array(plaintextBuffer)
    const result = new Uint8Array(plaintext)
    plaintext.fill(0)
    return result
  } catch {
    throw invalidFile()
  } finally {
    if (plaintextBuffer) new Uint8Array(plaintextBuffer).fill(0)
  }
}

const clearParsed = (parsed: ParsedContainer): void => {
  parsed.header.fill(0)
  parsed.salt.fill(0)
  parsed.iv.fill(0)
  parsed.ciphertext.fill(0)
  parsed.metadata.salt.fill(0)
  parsed.metadata.iv.fill(0)
}

/** Decrypt a Nimvo file with an already imported PBKDF2 password key. */
export async function decryptNimvoFileWithPasswordKey(
  container: Uint8Array | ArrayBuffer,
  passwordKey: CryptoKey,
): Promise<{ plaintext: Uint8Array; metadata: NimvoMetadata }> {
  const parsed = parseContainer(container)
  try {
    const plaintext = await decryptParsed(parsed, passwordKey)
    return { plaintext, metadata: parsed.metadata }
  } finally {
    // The returned metadata contains independent salt/IV copies, so it remains
    // usable after the parser's authentication material is cleared.
    parsed.header.fill(0)
    parsed.salt.fill(0)
    parsed.iv.fill(0)
    parsed.ciphertext.fill(0)
  }
}

export const decryptNimvoFileWithKey = decryptNimvoFileWithPasswordKey

/** Parse, import the password, authenticate, and decrypt a Nimvo file. */
export async function decryptNimvoFile(
  container: Uint8Array | ArrayBuffer,
  password: string,
): Promise<DecryptedNimvoFile> {
  const parsed = parseContainer(container)
  try {
    const passwordKey = await importPasswordKey(password)
    const plaintext = await decryptParsed(parsed, passwordKey)
    const metadata: NimvoMetadata = {
      ...parsed.metadata,
      salt: new Uint8Array(parsed.metadata.salt),
      iv: new Uint8Array(parsed.metadata.iv),
    }
    return { plaintext, passwordKey, metadata }
  } finally {
    clearParsed(parsed)
  }
}
