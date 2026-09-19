import type { Database } from 'sql.js'

export const CURRENCY_SCHEMA_VERSION = 2

/** Stores the one currency that gives meaning to every amount in a vault. */
export const migrateCurrency = (db: Database): void => {
  db.run(`
    INSERT INTO app_meta(key, value)
    VALUES ('currency', 'ARS')
    ON CONFLICT(key) DO NOTHING;

    UPDATE months
    SET currency = (SELECT value FROM app_meta WHERE key = 'currency')
    WHERE currency <> (SELECT value FROM app_meta WHERE key = 'currency');
  `)
}
