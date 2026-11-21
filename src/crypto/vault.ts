/**
 * Vault-level cryptography: creates and opens vault keys and encrypts saves.
 *
 * Argon2id (container v2) has no Web Crypto equivalent, so a fresh salt per
 * save would require keeping the password itself in memory. Instead the key is
 * derived once when the vault is created or opened and only a non-extractable,
 * encrypt-only AES key plus the file's salt are kept; every save uses a fresh
 * random 96-bit IV. The password is never retained.
 */
import type { Argon2Params } from './argon2.ts'
import { clearParsedV2, decryptParsedV2, encryptV2, NIMVO_V2_VERSION, parseV2, randomSalt } from './container-v2.ts'
import {
  LEGACY_MONEO_MAGIC,
  NIMVO_MAGIC,
  decryptNimvoFile,
  encryptSqliteBytes,
  importPasswordKey,
  type RandomSource,
} from './index.ts'
import type { Kdf } from './kdf.ts'

export type FormatVersion = 1 | 2

/**
 * Container version written by saves. Changing this to 1 ships v2 *read*
 * support while still writing PBKDF2 files that older app versions can open.
 */
export const WRITTEN_FORMAT_VERSION: FormatVersion = 2

export type VaultKey =
  | { kind: 'pbkdf2'; passwordKey: CryptoKey }
  | { kind: 'argon2id'; encryptKey: CryptoKey; salt: Uint8Array; params: Argon2Params }

export interface VaultCryptoOptions {
  kdf: Kdf
  formatVersion?: FormatVersion
  rng?: RandomSource
}

export interface OpenedVault {
  plaintext: Uint8Array
  vaultKey: VaultKey
  /** `legacy` marks `.moneo` imports, which must never be overwritten in place. */
  format: 'nimvo' | 'legacy'
  /** Container version of the file that was opened (not the one the next save writes). */
  sourceVersion: FormatVersion
}

const argon2Key = async (password: string, options: VaultCryptoOptions): Promise<VaultKey> => {
  const salt = randomSalt(options.rng)
  const params = { ...options.kdf.defaultParams }
  const keys = await options.kdf.derive(new TextEncoder().encode(password), salt, params)
  return { kind: 'argon2id', encryptKey: keys.encryptKey, salt, params }
}

/** Key for a brand new vault. */
export async function createVaultKey(password: string, options: VaultCryptoOptions): Promise<VaultKey> {
  if (typeof password !== 'string') throw new TypeError('Password must be a string')
  if ((options.formatVersion ?? WRITTEN_FORMAT_VERSION) === 1) {
    return { kind: 'pbkdf2', passwordKey: await importPasswordKey(password) }
  }
  return argon2Key(password, options)
}

// Any recognised magic with version 2 goes to the v2 parser, which rejects
// `.moneo` (that format only ever existed as version 1) as an invalid file.
const isV2 = (bytes: Uint8Array): boolean => {
  if (bytes.length <= 5 || bytes[5] !== NIMVO_V2_VERSION) return false
  const magic = new TextDecoder().decode(bytes.subarray(0, NIMVO_MAGIC.length))
  return magic === NIMVO_MAGIC || magic === LEGACY_MONEO_MAGIC
}

/**
 * Authenticates and decrypts a container before anything is opened.
 * Version 1 and legacy files are read with PBKDF2 and the key for the next
 * save is upgraded to Argon2id (when the writer version is 2).
 */
export async function openVaultContainer(container: Uint8Array, password: string, options: VaultCryptoOptions): Promise<OpenedVault> {
  const bytes = new Uint8Array(container)
  try {
    const writeVersion = options.formatVersion ?? WRITTEN_FORMAT_VERSION
    if (isV2(bytes)) {
      const parsed = parseV2(bytes)
      try {
        const keys = await options.kdf.derive(new TextEncoder().encode(password), parsed.salt, parsed.params)
        const plaintext = await decryptParsedV2(parsed, keys.decryptKey)
        try {
          const vaultKey: VaultKey = writeVersion === 2
            ? { kind: 'argon2id', encryptKey: keys.encryptKey, salt: new Uint8Array(parsed.salt), params: { ...parsed.params } }
            : { kind: 'pbkdf2', passwordKey: await importPasswordKey(password) }
          return { plaintext, vaultKey, format: 'nimvo', sourceVersion: 2 }
        } catch (error) {
          plaintext.fill(0)
          throw error
        }
      } finally {
        clearParsedV2(parsed)
      }
    }

    // Version 1 and legacy files, or an unsupported version (rejected here).
    const decrypted = await decryptNimvoFile(bytes, password)
    try {
      const vaultKey: VaultKey = writeVersion === 2
        ? await argon2Key(password, options)
        : { kind: 'pbkdf2', passwordKey: decrypted.passwordKey }
      return { plaintext: decrypted.plaintext, vaultKey, format: decrypted.metadata.format, sourceVersion: 1 }
    } catch (error) {
      decrypted.plaintext.fill(0)
      throw error
    }
  } finally {
    bytes.fill(0)
  }
}

/** Encrypts SQLite bytes for saving, in the container version that matches the key. */
export function encryptVault(plaintext: Uint8Array, key: VaultKey, rng?: RandomSource): Promise<Uint8Array> {
  return key.kind === 'argon2id'
    ? encryptV2(plaintext, key, rng)
    : encryptSqliteBytes(plaintext, key.passwordKey, { rng })
}

/** Zeroes the non-secret parts of a key that is being discarded. */
export function clearVaultKey(key: VaultKey | undefined): void {
  if (key?.kind === 'argon2id') key.salt.fill(0)
}
