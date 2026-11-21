import { ARGON2_DEFAULT_PARAMS, deriveVaultKeys, type Argon2Params, type DerivedKeys } from './argon2.ts'
import type { KdfRequest, KdfResponse } from './kdf.worker.ts'

/** Key-derivation strategy injected into the vault session. */
export interface Kdf {
  /** Parameters used when a new key is created (new vault or v1 upgrade). */
  readonly defaultParams: Argon2Params
  /** Takes ownership of `password` and zeroes it. */
  derive(password: Uint8Array, salt: Uint8Array, params: Argon2Params): Promise<DerivedKeys>
}

/**
 * Upper bound for one derivation. The largest accepted parameters (256 MiB, 10
 * passes) take well under a minute on a desktop; this only guards against a
 * browser killing the worker without any event, which would otherwise hang the
 * session's serialized queue (and with it save and lock) forever.
 */
export const KDF_TIMEOUT_MS = 120_000

/** Derives in a fresh module Worker and terminates it, releasing the WASM memory. */
export const workerKdf: Kdf = {
  defaultParams: ARGON2_DEFAULT_PARAMS,
  derive(password, salt, params) {
    return new Promise<DerivedKeys>((resolve, reject) => {
      let worker: Worker
      try {
        worker = new Worker(new URL('./kdf.worker.ts', import.meta.url), { type: 'module' })
      } catch (error) {
        password.fill(0)
        reject(error)
        return
      }
      // Once posted, the password buffer is transferred (detached) and must not be
      // touched again: the worker zeroes it. Every path below settles the promise,
      // because a hung derivation would block the session's serialized queue.
      const watchdog = setTimeout(() => fail(), KDF_TIMEOUT_MS)
      const fail = () => {
        clearTimeout(watchdog)
        worker.terminate()
        reject(new Error('Key derivation failed'))
      }
      worker.onmessage = (event: MessageEvent<KdfResponse>) => {
        clearTimeout(watchdog)
        worker.terminate()
        if (event.data.ok) resolve({ encryptKey: event.data.encryptKey, decryptKey: event.data.decryptKey })
        else reject(new Error('Key derivation failed'))
      }
      worker.onerror = fail
      worker.onmessageerror = fail
      const request: KdfRequest = { password, salt: new Uint8Array(salt), params }
      try {
        worker.postMessage(request, [password.buffer])
      } catch (error) {
        clearTimeout(watchdog)
        worker.terminate()
        password.fill(0)
        reject(error)
      }
    })
  },
}

/** Derives on the calling thread. Only for environments without Workers (tests, very old browsers). */
export const inThreadKdf: Kdf = {
  defaultParams: ARGON2_DEFAULT_PARAMS,
  derive: (password, salt, params) => deriveVaultKeys(password, new Uint8Array(salt), params),
}

export const defaultKdf = (): Kdf => (typeof Worker === 'undefined' ? inThreadKdf : workerKdf)
