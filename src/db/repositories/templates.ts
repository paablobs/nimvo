import type { Database } from 'sql.js'
import { createIdFactory, nowIso } from '../ids.ts'
import type { IdFactory, NewTemplate, RecurringDebtTemplate } from '../types.ts'
import { bool, queryOne, queryRows, required, runSql, safeInteger, timestamp, writeTransaction } from './common.ts'

type OrderedTemplate = RecurringDebtTemplate & { sortOrder: number }

const mapTemplate = (row: Record<string, unknown>): OrderedTemplate => ({ id: String(row.id), concept: String(row.concept), defaultAmountCents: row.default_amount_cents == null ? null : safeInteger(row.default_amount_cents, 'default_amount_cents'), dueDay: row.due_day == null ? null : safeInteger(row.due_day, 'due_day'), isActive: bool(row.is_active), createdAt: timestamp(row.created_at, 'created_at'), updatedAt: timestamp(row.updated_at, 'updated_at'), sortOrder: safeInteger(row.sort_order, 'sort_order') })

export class TemplatesRepository {
  private readonly ids: IdFactory
  private readonly db: Database
  constructor(db: Database, ids?: IdFactory) { this.db = db; this.ids = createIdFactory(ids) }
  getById(id: string): OrderedTemplate | undefined { const row = queryOne(this.db, 'SELECT * FROM recurring_debt_templates WHERE id = ?', [id]); return row && mapTemplate(row) }
  list(activeOnly = false): OrderedTemplate[] { return queryRows(this.db, `SELECT * FROM recurring_debt_templates${activeOnly ? ' WHERE is_active = 1' : ''} ORDER BY sort_order, id COLLATE NOCASE`).map(mapTemplate) }
  create(input: NewTemplate): OrderedTemplate {
    const id = input.id ?? this.ids(), createdAt = input.createdAt ?? nowIso(), updatedAt = input.updatedAt ?? createdAt
    timestamp(createdAt, 'created_at'); timestamp(updatedAt, 'updated_at')
    if (!input.concept.trim() || (input.defaultAmountCents !== null && (!Number.isSafeInteger(input.defaultAmountCents) || input.defaultAmountCents < 0))) throw new Error('Plantilla inválida')
    if (input.dueDay !== null && (!Number.isSafeInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31)) throw new Error('Día inválido')
    return writeTransaction(this.db, () => {
      const nextSortOrder = safeInteger(queryOne(this.db, 'SELECT COALESCE(MAX(sort_order), -1) + 1 AS sort_order FROM recurring_debt_templates')?.sort_order, 'sort_order')
      runSql(this.db, 'INSERT INTO recurring_debt_templates(id, concept, default_amount_cents, due_day, is_active, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, input.concept.trim(), input.defaultAmountCents, input.dueDay, input.isActive ? 1 : 0, createdAt, updatedAt, nextSortOrder])
      return required(this.getById(id), 'recurring debt template')
    })
  }
  update(id: string, input: Partial<Omit<NewTemplate, 'id'>>): OrderedTemplate {
    const current = required(this.getById(id), 'recurring debt template'), next = { ...current, ...input }
    if (!next.concept.trim() || (next.defaultAmountCents !== null && (!Number.isSafeInteger(next.defaultAmountCents) || next.defaultAmountCents < 0)) || (next.dueDay !== null && (!Number.isSafeInteger(next.dueDay) || next.dueDay < 1 || next.dueDay > 31))) throw new Error('Plantilla inválida')
    return writeTransaction(this.db, () => {
      runSql(this.db, 'UPDATE recurring_debt_templates SET concept = ?, default_amount_cents = ?, due_day = ?, is_active = ?, updated_at = ? WHERE id = ?', [next.concept.trim(), next.defaultAmountCents, next.dueDay, next.isActive ? 1 : 0, nowIso(), id])
      return required(this.getById(id), 'recurring debt template')
    })
  }
  archive(id: string): OrderedTemplate { return this.update(id, { isActive: false }) }
  delete(id: string): void { writeTransaction(this.db, () => { runSql(this.db, 'DELETE FROM recurring_debt_templates WHERE id = ?', [id]) }) }

  reorder(ids: string[]): void {
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('Orden de plantillas inválido')
    writeTransaction(this.db, () => {
      const existing = queryRows(this.db, 'SELECT id FROM recurring_debt_templates')
      const existingIds = new Set(existing.map((row) => String(row.id)))
      if (existingIds.size !== ids.length || ids.some((id) => !existingIds.has(id))) throw new Error('Orden de plantillas inválido')
      ids.forEach((id, sortOrder) => runSql(this.db, 'UPDATE recurring_debt_templates SET sort_order = ? WHERE id = ?', [sortOrder, id]))
    })
  }
}
