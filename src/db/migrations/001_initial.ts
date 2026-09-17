import type { Database } from 'sql.js'

export const INITIAL_SCHEMA_VERSION = 1

/** The complete v1 schema. It is intentionally kept in one migration so an
 * exported database can be reopened without relying on application state. */
export const migrateInitial = (db: Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS months (
      id TEXT PRIMARY KEY NOT NULL,
      year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 9999),
      month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
      initial_amount_cents INTEGER NOT NULL CHECK (typeof(initial_amount_cents) = 'integer'),
      currency TEXT NOT NULL DEFAULT 'ARS',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (year, month)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color_token TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recurring_debt_templates (
      id TEXT PRIMARY KEY NOT NULL,
      concept TEXT NOT NULL,
      default_amount_cents INTEGER CHECK (default_amount_cents IS NULL OR (typeof(default_amount_cents) = 'integer' AND default_amount_cents >= 0)),
      due_day INTEGER CHECK (due_day IS NULL OR (typeof(due_day) = 'integer' AND due_day BETWEEN 1 AND 31)),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS debts (
      id TEXT PRIMARY KEY NOT NULL,
      month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
      template_id TEXT REFERENCES recurring_debt_templates(id) ON DELETE SET NULL,
      concept TEXT NOT NULL,
      due_date TEXT,
      amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents > 0),
      paid_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      spent_on TEXT NOT NULL,
      description TEXT,
      amount_cents INTEGER NOT NULL CHECK (typeof(amount_cents) = 'integer' AND amount_cents > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_debts_month_due_date ON debts(month_id, due_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_month_spent_on ON expenses(month_id, spent_on);
    CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
  `)
}

export const migrations: ReadonlyArray<{ version: number; run: (db: Database) => void }> = [
  { version: INITIAL_SCHEMA_VERSION, run: migrateInitial },
]
