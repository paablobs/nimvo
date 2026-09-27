import type { Database } from 'sql.js'

export const TEMPLATE_ORDER_SCHEMA_VERSION = 3

/** Adds a durable presentation order to recurring debt templates. */
export const migrateTemplateOrder = (db: Database): void => {
  db.run(`
    ALTER TABLE recurring_debt_templates
      ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0
      CHECK (typeof(sort_order) = 'integer' AND sort_order >= 0);

    UPDATE recurring_debt_templates
    SET sort_order = (
      SELECT COUNT(*)
      FROM recurring_debt_templates AS predecessor
      WHERE predecessor.concept COLLATE NOCASE < recurring_debt_templates.concept COLLATE NOCASE
         OR (
           predecessor.concept COLLATE NOCASE = recurring_debt_templates.concept COLLATE NOCASE
           AND predecessor.id < recurring_debt_templates.id
         )
    );

    CREATE INDEX IF NOT EXISTS idx_templates_sort_order
      ON recurring_debt_templates(sort_order, id);
  `)
}
