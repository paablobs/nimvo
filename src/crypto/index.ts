/**
 * Moneo encrypted-file container.
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

export const MONEO_MAGIC = 'MONEO'
export const MONEO_VERSION = 1
export const MONEO_KDF_ID = 1
export const MONEO_HASH_ID = 1
export const MONEO_SALT_LENGTH = 16
export const MONEO_IV_LENGTH = 12
export const MONEO_GCM_TAG_LENGTH = 16
export const MONEO_HEADER_LENGTH = 18

// Measured on the reference environment on 2026-09-17: about 247 ms in
// Chromium and 330 ms in Firefox. The value is stored in every v1 header.
export const DEFAULT_PBKDF2_ITERATIONS = 1_800_000
export const MIN_PBKDF2_ITERATIONS = 1_000
export const MAX_PBKDF2_ITERATIONS = 2_000_000

// Avoid allocating attacker-controlled amounts of memory while parsing.
export const MAX_CIPHERTEXT_LENGTH = 128 * 1024 * 1024

export const INVALID_MONEO_FILE_MESSAGE = 'Contraseña incorrecta o archivo dañado'
export const UNSUPPORTED_MONEO_VERSION_MESSAGE = 'Versión de archivo no soportada'

export type MoneoErrorCode = 'INVALID_FILE' | 'UNSUPPORTED_VERSION'

export class MoneoCryptoError extends Error {
  readonly code: MoneoErrorCode

  constructor(code: MoneoErrorCode) {
    super(code === 'UNSUPPORTED_VERSION' ? UNSUPPORTED_MONEO_VERSION_MESSAGE : INVALID_MONEO_FILE_MESSAGE)
    this.name = 'MoneoCryptoError'
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

export interface MoneoMetadata {
  version: number
  kdfId: number
  hashId: number
  iterations: number
  salt: Uint8Array
  iv: Uint8Array
  ciphertextLength: number
}

export interface DecryptedMoneoFile {
  plaintext: Uint8Array
  passwordKey: CryptoKey
  metadata: MoneoMetadata
}

interface ParsedContainer {
  header: Uint8Array
  salt: Uint8Array
  iv: Uint8Array
  ciphertext: Uint8Array
  metadata: MoneoMetadata
}

const invalidFile = (): MoneoCryptoError => new MoneoCryptoError('INVALID_FILE')

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
  const header = new Uint8Array(MONEO_HEADER_LENGTH + salt.length + iv.length)
  header.set(textEncoder.encode(MONEO_MAGIC), 0)
  header[5] = MONEO_VERSION
  header[6] = MONEO_KDF_ID
  header[7] = MONEO_HASH_ID
  writeU32(header, 8, iterations)
  header[12] = salt.length
  header[13] = iv.length
  writeU32(header, 14, ciphertextLength)
  header.set(salt, MONEO_HEADER_LENGTH)
  header.set(iv, MONEO_HEADER_LENGTH + salt.length)
  return header
}

/** Encrypt SQLite bytes into a Moneo v1 container. */
export async function encryptSqliteBytes(
  plaintext: Uint8Array | ArrayBuffer,
  passwordKey: CryptoKey,
  optionsOrIterations?: number | EncryptOptions,
  randomSource?: RandomSource,
): Promise<Uint8Array> {
  const options = normalizeEncryptOptions(optionsOrIterations, randomSource)
  validateIterations(options.iterations)

  const plaintextCopy = asBytesCopy(plaintext)
  const salt = randomBytes(MONEO_SALT_LENGTH, options.rng)
  const iv = randomBytes(MONEO_IV_LENGTH, options.rng)
  const ciphertextLength = plaintextCopy.length + MONEO_GCM_TAG_LENGTH
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
    if (bytes.length < MONEO_HEADER_LENGTH) throw invalidFile()

    const magic = new TextDecoder().decode(bytes.subarray(0, MONEO_MAGIC.length))
    if (magic !== MONEO_MAGIC) throw invalidFile()

    const version = bytes[5]
    if (version !== MONEO_VERSION) throw new MoneoCryptoError('UNSUPPORTED_VERSION')

    const kdfId = bytes[6]
    const hashId = bytes[7]
    const iterations = readU32(bytes, 8)
    const saltLength = bytes[12]
    const ivLength = bytes[13]
    const ciphertextLength = readU32(bytes, 14)
    if (
      kdfId !== MONEO_KDF_ID ||
      hashId !== MONEO_HASH_ID ||
      saltLength !== MONEO_SALT_LENGTH ||
      ivLength !== MONEO_IV_LENGTH ||
      ciphertextLength < MONEO_GCM_TAG_LENGTH ||
      ciphertextLength > MAX_CIPHERTEXT_LENGTH ||
      !Number.isInteger(iterations) ||
      iterations < MIN_PBKDF2_ITERATIONS ||
      iterations > MAX_PBKDF2_ITERATIONS
    ) {
      throw invalidFile()
    }

    const expectedLength = MONEO_HEADER_LENGTH + saltLength + ivLength + ciphertextLength
    if (expectedLength !== bytes.length) throw invalidFile()

    const headerLength = MONEO_HEADER_LENGTH + saltLength + ivLength
    const header = bytes.slice(0, headerLength)
    const salt = bytes.slice(MONEO_HEADER_LENGTH, MONEO_HEADER_LENGTH + saltLength)
    const iv = bytes.slice(MONEO_HEADER_LENGTH + saltLength, headerLength)
    const ciphertext = bytes.slice(headerLength)
    return {
      header,
      salt,
      iv,
      ciphertext,
      metadata: { version, kdfId, hashId, iterations, salt: new Uint8Array(salt), iv: new Uint8Array(iv), ciphertextLength },
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

/** Decrypt a Moneo file with an already imported PBKDF2 password key. */
export async function decryptMoneoFileWithPasswordKey(
  container: Uint8Array | ArrayBuffer,
  passwordKey: CryptoKey,
): Promise<{ plaintext: Uint8Array; metadata: MoneoMetadata }> {
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

export const decryptMoneoFileWithKey = decryptMoneoFileWithPasswordKey

/** Parse, import the password, authenticate, and decrypt a Moneo file. */
export async function decryptMoneoFile(
  container: Uint8Array | ArrayBuffer,
  password: string,
): Promise<DecryptedMoneoFile> {
  const parsed = parseContainer(container)
  try {
    const passwordKey = await importPasswordKey(password)
    const plaintext = await decryptParsed(parsed, passwordKey)
    const metadata: MoneoMetadata = {
      ...parsed.metadata,
      salt: new Uint8Array(parsed.metadata.salt),
      iv: new Uint8Array(parsed.metadata.iv),
    }
    return { plaintext, passwordKey, metadata }
  } finally {
    clearParsed(parsed)
  }
}
