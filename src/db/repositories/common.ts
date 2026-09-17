import type { Database, SqlValue } from 'sql.js'
import { isValidTimestamp } from '../../domain/validation.ts'

export type Row = Record<string, unknown>

export const runSql = (db: Database, sql: string, params: unknown[] = []): void => {
  db.run(sql, params as SqlValue[])
}

const activeTransactions = new WeakSet<Database>()

export const writeTransaction = <T>(db: Database, callback: () => T): T => {
  if (activeTransactions.has(db)) return callback()
  db.run('BEGIN')
  activeTransactions.add(db)
  try {
    const result = callback()
    db.run('COMMIT')
    return result
  } catch (error) {
    try { db.run('ROLLBACK') } catch { /* preserve original error */ }
    throw error
  } finally {
    activeTransactions.delete(db)
  }
}

export const queryRows = (db: Database, sql: string, params: SqlValue[] = []): Row[] => {
  const statement = db.prepare(sql)
  try {
    statement.bind(params)
    const rows: Row[] = []
    while (statement.step()) rows.push(statement.getAsObject() as Row)
    return rows
  } finally {
    statement.free()
  }
}

export const queryOne = (db: Database, sql: string, params: SqlValue[] = []): Row | undefined =>
  queryRows(db, sql, params)[0]

export const required = <T>(value: T | undefined, entity: string): T => {
  if (value === undefined) throw new Error(`${entity} not found`)
  return value
}

export const bool = (value: unknown): boolean => Number(value) === 1

export const safeInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${field} debe ser un entero seguro`)
  return value as number
}

export const text = (value: unknown, field: string): string => {
  if (typeof value !== 'string') throw new TypeError(`${field} inválido`)
  return value
}

export const timestamp = (value: unknown, field: string): string => {
  if (!isValidTimestamp(value)) throw new RangeError(`${field} debe ser un instante ISO-8601 válido`)
  return value
}

export const nullableTimestamp = (value: unknown, field: string): string | null =>
  value == null ? null : timestamp(value, field)
