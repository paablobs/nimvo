import type { Database } from 'sql.js'
import { DEFAULT_CURRENCY, isCurrencyCode, type CurrencyCode } from '../../domain/currency.ts'
import { queryOne, runSql, text, writeTransaction } from './common.ts'

const CURRENCY_KEY = 'currency'

export class VaultRepository {
  private readonly db: Database

  constructor(db: Database) { this.db = db }

  getCurrency(): CurrencyCode {
    const row = queryOne(this.db, 'SELECT value FROM app_meta WHERE key = ?', [CURRENCY_KEY])
    const value = row ? text(row.value, CURRENCY_KEY) : undefined
    return isCurrencyCode(value) ? value : DEFAULT_CURRENCY
  }

  setCurrency(currency: CurrencyCode): CurrencyCode {
    if (!isCurrencyCode(currency)) throw new RangeError('Moneda inválida')
    return writeTransaction(this.db, () => {
      runSql(this.db, `INSERT INTO app_meta(key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [CURRENCY_KEY, currency])
      // Keep the published per-month column coherent for old readers and history exports.
      runSql(this.db, 'UPDATE months SET currency = ?', [currency])
      return currency
    })
  }
}

