import type { Database } from 'sql.js'

export const NULLABLE_DEBT_AMOUNT_SCHEMA_VERSION = 4

/** Allows a recurring debt to be created before its amount is known. */
export const migrateNullableDebtAmount = (db: Database): void => {
  db.exec(`
    CREATE TABLE debts_nullable_amount (
      id TEXT PRIMARY KEY NOT NULL,
      month_id TEXT NOT NULL REFERENCES months(id) ON DELETE CASCADE,
      template_id TEXT REFERENCES recurring_debt_templates(id) ON DELETE SET NULL,
      concept TEXT NOT NULL,
      due_date TEXT,
      amount_cents INTEGER CHECK (amount_cents IS NULL OR (typeof(amount_cents) = 'integer' AND amount_cents > 0)),
      paid_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (amount_cents IS NOT NULL OR paid_at IS NULL)
    );

    INSERT INTO debts_nullable_amount(id, month_id, template_id, concept, due_date, amount_cents, paid_at, created_at, updated_at)
    SELECT id, month_id, template_id, concept, due_date, amount_cents, paid_at, created_at, updated_at
    FROM debts;

    DROP TABLE debts;
    ALTER TABLE debts_nullable_amount RENAME TO debts;
    CREATE INDEX IF NOT EXISTS idx_debts_month_due_date ON debts(month_id, due_date);
  `)
}
