import type { Database } from 'sql.js'
import { migrations } from './001_initial.ts'

export { migrations }

const readUserVersion = (db: Database): number => {
  const result = db.exec('PRAGMA user_version')
  return Number(result[0]?.values[0]?.[0] ?? 0)
}

const setMetaVersion = (db: Database, version: number): void => {
  db.run(
    `INSERT INTO app_meta(key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(version)],
  )
}

export const runMigrations = (db: Database): number => {
  db.run('PRAGMA foreign_keys = ON')
  let version = readUserVersion(db)
  for (const migration of migrations) {
    if (migration.version <= version) continue
    db.run('BEGIN')
    try {
      migration.run(db)
      db.run(`PRAGMA user_version = ${migration.version}`)
      setMetaVersion(db, migration.version)
      db.run('COMMIT')
      version = migration.version
    } catch (error) {
      try { db.run('ROLLBACK') } catch { /* preserve migration error */ }
      throw error
    }
  }
  return version
}
