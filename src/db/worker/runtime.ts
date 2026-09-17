import { LocalDatabase } from '../database.ts'

export type DatabaseOpener = (bytes?: Uint8Array) => Promise<LocalDatabase>

/** Opens a candidate database first, preserving the current one on failure. */
export const replaceDatabase = async (current: LocalDatabase | undefined, bytes?: Uint8Array, open: DatabaseOpener = (value) => LocalDatabase.open(value)): Promise<LocalDatabase> => {
  const candidate = await open(bytes)
  current?.close()
  return candidate
}
