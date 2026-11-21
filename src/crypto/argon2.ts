import { argon2id } from 'hash-wasm'

import { asArrayBuffer } from './index.ts'

/**
 * Argon2id parameters stored in every v2 header.
 *
 * Defaults follow OWASP's guidance of at least m=19 MiB, t=2, p=1 and add
 * headroom: 64 MiB and three passes. Measured on 2026-11-20 with Playwright,
 * Argon2id inside a module Worker, median of 5 derivations: 341 ms in Chromium
 * and 384 ms in Firefox (19 MiB/t=2: 95 / 109 ms; 64 MiB/t=2: 263 / 288 ms;
 * 128 MiB/t=3: 659 / 724 ms). Unlock time is dominated by this one derivation
 * (opening a v1 file adds its PBKDF2 pass, about 250-330 ms, once).
 */
export interface Argon2Params {
  memoryKiB: number
  timeCost: number
  parallelism: number
}

export const ARGON2_DEFAULT_PARAMS: Argon2Params = { memoryKiB: 65_536, timeCost: 3, parallelism: 1 }

// Bounds enforced while parsing a container, before any derivation. A crafted
// file chooses these numbers, so they cap the memory and time it can demand.
export const ARGON2_MIN_MEMORY_KIB = 19_456
export const ARGON2_MAX_MEMORY_KIB = 262_144
export const ARGON2_MIN_TIME_COST = 2
export const ARGON2_MAX_TIME_COST = 10
export const ARGON2_PARALLELISM = 1
export const ARGON2_HASH_LENGTH = 32

export const isValidArgon2Params = (params: Argon2Params): boolean =>
  Number.isInteger(params.memoryKiB) &&
  params.memoryKiB >= ARGON2_MIN_MEMORY_KIB &&
  params.memoryKiB <= ARGON2_MAX_MEMORY_KIB &&
  Number.isInteger(params.timeCost) &&
  params.timeCost >= ARGON2_MIN_TIME_COST &&
  params.timeCost <= ARGON2_MAX_TIME_COST &&
  params.parallelism === ARGON2_PARALLELISM

/** Keys derived from one Argon2id run. Neither exposes the raw key material. */
export interface DerivedKeys {
  /** Kept for the whole session to encrypt every save. */
  encryptKey: CryptoKey
  /** Used once to authenticate and decrypt the file being opened. */
  decryptKey: CryptoKey
}

/**
 * Runs Argon2id and turns the result into non-extractable AES-GCM keys.
 * The password bytes and the raw derived bytes are zeroed before returning.
 * Run this inside a Worker so the main thread never blocks.
 */
export async function deriveVaultKeys(password: Uint8Array, salt: Uint8Array, params: Argon2Params): Promise<DerivedKeys> {
  let raw: Uint8Array | undefined
  try {
    // Inside the try so the password is zeroed even when the parameters are rejected.
    if (!isValidArgon2Params(params)) throw new RangeError('Argon2id parameters are out of bounds')
    raw = await argon2id({
      password,
      salt,
      parallelism: params.parallelism,
      iterations: params.timeCost,
      memorySize: params.memoryKiB,
      hashLength: ARGON2_HASH_LENGTH,
      outputType: 'binary',
    })
    const subtle = globalThis.crypto.subtle
    const rawBuffer = asArrayBuffer(new Uint8Array(raw))
    try {
      const [encryptKey, decryptKey] = await Promise.all([
        subtle.importKey('raw', rawBuffer, { name: 'AES-GCM', length: 256 }, false, ['encrypt']),
        subtle.importKey('raw', rawBuffer, { name: 'AES-GCM', length: 256 }, false, ['decrypt']),
      ])
      return { encryptKey, decryptKey }
    } finally {
      new Uint8Array(rawBuffer).fill(0)
    }
  } finally {
    raw?.fill(0)
    password.fill(0)
  }
}
