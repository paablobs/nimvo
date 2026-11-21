import { ARGON2_MIN_MEMORY_KIB, ARGON2_MIN_TIME_COST, deriveVaultKeys } from '../crypto/argon2.ts'
import type { Kdf } from '../crypto/kdf.ts'

/**
 * Real Argon2id (hash-wasm) on the calling thread with the smallest parameters
 * the format allows (OWASP minimum). Used by tests, which have no Worker, to
 * keep each derivation around 100 ms. The format's bounds are not relaxed.
 * Imports only types from `kdf.ts`: that module is mocked in `setup.ts`.
 */
export const testKdf: Kdf = {
  defaultParams: { memoryKiB: ARGON2_MIN_MEMORY_KIB, timeCost: ARGON2_MIN_TIME_COST, parallelism: 1 },
  derive: (password, salt, params) => deriveVaultKeys(password, new Uint8Array(salt), params),
}
