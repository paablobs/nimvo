import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { runMigrations } from './migrations/index.ts'

export type SqlJsLoader = (config?: Parameters<typeof initSqlJs>[0]) => Promise<SqlJsStatic>

let sqlJsPromise: Promise<SqlJsStatic> | undefined

const loadSqlJs = async (loader: SqlJsLoader = initSqlJs): Promise<SqlJsStatic> => {
  if (loader === initSqlJs) {
    if (typeof window === 'undefined' && typeof self === 'undefined') {
      sqlJsPromise ??= loader()
      return sqlJsPromise
    }
    const runtime = globalThis as typeof globalThis & { process?: { versions?: { node?: string } } }
    const sourceRuntime = import.meta.url.includes('/src/')
    const locateFile = runtime.process?.versions?.node || sourceRuntime
      ? () => new URL('../../node_modules/sql.js/dist/sql-wasm.wasm', import.meta.url).pathname
      : () => wasmUrl
    sqlJsPromise ??= loader({ locateFile })
    return sqlJsPromise
  }
  return loader()
}

export class LocalDatabase {
  readonly raw: Database
  readonly schemaVersion: number

  private constructor(raw: Database) {
    this.raw = raw
    this.schemaVersion = runMigrations(raw)
  }

  static async open(bytes?: Uint8Array, loader?: SqlJsLoader): Promise<LocalDatabase> {
    const sql = await loadSqlJs(loader)
    const raw = bytes && bytes.byteLength > 0 ? new sql.Database(bytes) : new sql.Database()
    return new LocalDatabase(raw)
  }

  export(): Uint8Array {
    return this.raw.export()
  }

  close(): void {
    this.raw.close()
  }

  transaction<T>(callback: () => T): T {
    this.raw.run('BEGIN')
    try {
      const result = callback()
      this.raw.run('COMMIT')
      return result
    } catch (error) {
      try { this.raw.run('ROLLBACK') } catch { /* preserve original error */ }
      throw error
    }
  }
}
