/**
 * Nimvo encrypted-file container, version 2 (Argon2id + AES-256-GCM).
 *
 * Binary layout (all integer fields are unsigned big-endian):
 *
 *   magic[5] | version[1]=2 | kdf[1]=2 | memoryKiB[4] | timeCost[1]
 *   | parallelism[1] | saltLength[1] | ivLength[1] | ciphertextLength[4]
 *   | salt[saltLength] | iv[ivLength] | ciphertext[ciphertextLength]
 *
 * The complete header, through the IV, is authenticated as AES-GCM additional
 * authenticated data, so the Argon2id parameters cannot be altered without
 * detection. The ciphertext includes the 128-bit GCM tag. Parameters are
 * range-checked before any key derivation (see `argon2.ts`).
 */
import { isValidArgon2Params, type Argon2Params } from './argon2.ts'
import {
  MAX_CIPHERTEXT_LENGTH,
  NIMVO_GCM_TAG_LENGTH,
  NIMVO_IV_LENGTH,
  NIMVO_MAGIC,
  NIMVO_SALT_LENGTH,
  asArrayBuffer,
  getCrypto,
  invalidFile,
  randomBytes,
  readU32,
  writeU32,
  type RandomSource,
} from './index.ts'

export const NIMVO_V2_VERSION = 2
export const NIMVO_V2_KDF_ID = 2
export const NIMVO_V2_HEADER_LENGTH = 19

const textEncoder = new TextEncoder()

export interface ParsedV2Container {
  header: Uint8Array
  salt: Uint8Array
  iv: Uint8Array
  ciphertext: Uint8Array
  params: Argon2Params
}

const makeHeader = (params: Argon2Params, ciphertextLength: number, salt: Uint8Array, iv: Uint8Array): Uint8Array => {
  const header = new Uint8Array(NIMVO_V2_HEADER_LENGTH + salt.length + iv.length)
  header.set(textEncoder.encode(NIMVO_MAGIC), 0)
  header[5] = NIMVO_V2_VERSION
  header[6] = NIMVO_V2_KDF_ID
  writeU32(header, 7, params.memoryKiB)
  header[11] = params.timeCost
  header[12] = params.parallelism
  header[13] = salt.length
  header[14] = iv.length
  writeU32(header, 15, ciphertextLength)
  header.set(salt, NIMVO_V2_HEADER_LENGTH)
  header.set(iv, NIMVO_V2_HEADER_LENGTH + salt.length)
  return header
}

/** Generates the per-file salt stored in the header (kept for the vault's lifetime). */
export const randomSalt = (rng?: RandomSource): Uint8Array => randomBytes(NIMVO_SALT_LENGTH, rng)

/** Encrypts with an already derived key. Each call draws a fresh random IV. */
export async function encryptV2(
  plaintext: Uint8Array,
  key: { encryptKey: CryptoKey; salt: Uint8Array; params: Argon2Params },
  rng?: RandomSource,
): Promise<Uint8Array> {
  if (!isValidArgon2Params(key.params) || key.salt.length !== NIMVO_SALT_LENGTH) throw new RangeError('Invalid vault key')
  const plaintextCopy = new Uint8Array(plaintext)
  const iv = randomBytes(NIMVO_IV_LENGTH, rng)
  const ciphertextLength = plaintextCopy.length + NIMVO_GCM_TAG_LENGTH
  let header: Uint8Array | undefined
  let ciphertextBuffer: ArrayBuffer | undefined
  try {
    if (ciphertextLength > MAX_CIPHERTEXT_LENGTH) throw new RangeError('Plaintext is too large')
    header = makeHeader(key.params, ciphertextLength, key.salt, iv)
    ciphertextBuffer = await getCrypto().subtle.encrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(iv), additionalData: asArrayBuffer(header), tagLength: 128 },
      key.encryptKey,
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
    iv.fill(0)
    header?.fill(0)
    if (ciphertextBuffer) new Uint8Array(ciphertextBuffer).fill(0)
  }
}

/**
 * Validates and splits a v2 container. Every check happens before key
 * derivation, and every failure is the same generic INVALID_FILE error.
 */
export function parseV2(container: Uint8Array): ParsedV2Container {
  if (container.length < NIMVO_V2_HEADER_LENGTH) throw invalidFile()
  const magic = new TextDecoder().decode(container.subarray(0, NIMVO_MAGIC.length))
  // `.moneo` files only ever existed as version 1.
  if (magic !== NIMVO_MAGIC || container[5] !== NIMVO_V2_VERSION) throw invalidFile()

  const params: Argon2Params = { memoryKiB: readU32(container, 7), timeCost: container[11], parallelism: container[12] }
  const saltLength = container[13]
  const ivLength = container[14]
  const ciphertextLength = readU32(container, 15)
  if (
    container[6] !== NIMVO_V2_KDF_ID ||
    !isValidArgon2Params(params) ||
    saltLength !== NIMVO_SALT_LENGTH ||
    ivLength !== NIMVO_IV_LENGTH ||
    ciphertextLength < NIMVO_GCM_TAG_LENGTH ||
    ciphertextLength > MAX_CIPHERTEXT_LENGTH ||
    NIMVO_V2_HEADER_LENGTH + saltLength + ivLength + ciphertextLength !== container.length
  ) {
    throw invalidFile()
  }

  const headerLength = NIMVO_V2_HEADER_LENGTH + saltLength + ivLength
  return {
    header: container.slice(0, headerLength),
    salt: container.slice(NIMVO_V2_HEADER_LENGTH, NIMVO_V2_HEADER_LENGTH + saltLength),
    iv: container.slice(NIMVO_V2_HEADER_LENGTH + saltLength, headerLength),
    ciphertext: container.slice(headerLength),
    params,
  }
}

/** Authenticates and decrypts a parsed v2 container with an already derived key. */
export async function decryptParsedV2(parsed: ParsedV2Container, decryptKey: CryptoKey): Promise<Uint8Array> {
  let plaintextBuffer: ArrayBuffer | undefined
  try {
    plaintextBuffer = await getCrypto().subtle.decrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(parsed.iv), additionalData: asArrayBuffer(parsed.header), tagLength: 128 },
      decryptKey,
      asArrayBuffer(parsed.ciphertext),
    )
    return new Uint8Array(new Uint8Array(plaintextBuffer))
  } catch {
    throw invalidFile()
  } finally {
    if (plaintextBuffer) new Uint8Array(plaintextBuffer).fill(0)
  }
}

export const clearParsedV2 = (parsed: ParsedV2Container): void => {
  parsed.header.fill(0)
  parsed.salt.fill(0)
  parsed.iv.fill(0)
  parsed.ciphertext.fill(0)
}

