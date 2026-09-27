import type { Database } from 'sql.js'

export const DEBT_ORDER_SCHEMA_VERSION = 5

/** Adds a durable, per-month presentation order to fixed expenses. */
export const migrateDebtOrder = (db: Database): void => {
  db.exec(`
    ALTER TABLE debts
      ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0
      CHECK (typeof(sort_order) = 'integer' AND sort_order >= 0);

    UPDATE debts
    SET sort_order = (
      SELECT COUNT(*)
      FROM debts AS predecessor
      WHERE predecessor.month_id = debts.month_id
        AND (
          (predecessor.due_date IS NOT NULL AND debts.due_date IS NULL)
          OR (
            predecessor.due_date IS NOT NULL
            AND debts.due_date IS NOT NULL
            AND predecessor.due_date < debts.due_date
          )
          OR (
            (
              predecessor.due_date = debts.due_date
              OR (predecessor.due_date IS NULL AND debts.due_date IS NULL)
            )
            AND predecessor.id < debts.id
          )
        )
    );

    CREATE INDEX IF NOT EXISTS idx_debts_month_sort_order
      ON debts(month_id, sort_order, id);
  `)
}
