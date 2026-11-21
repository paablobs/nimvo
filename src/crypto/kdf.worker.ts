import { deriveVaultKeys, type Argon2Params } from './argon2.ts'

export interface KdfRequest {
  password: Uint8Array
  salt: Uint8Array
  params: Argon2Params
}

export type KdfResponse =
  | { ok: true; encryptKey: CryptoKey; decryptKey: CryptoKey }
  | { ok: false }

/**
 * Dedicated worker for one Argon2id derivation. The password arrives as a
 * transferred buffer and is zeroed by `deriveVaultKeys`; only non-extractable
 * CryptoKeys travel back to the page.
 */
self.onmessage = async (event: MessageEvent<KdfRequest>) => {
  const { password, salt, params } = event.data
  try {
    const keys = await deriveVaultKeys(password, salt, params)
    const response: KdfResponse = { ok: true, ...keys }
    self.postMessage(response)
  } catch {
    password.fill(0)
    const response: KdfResponse = { ok: false }
    self.postMessage(response)
  }
}
