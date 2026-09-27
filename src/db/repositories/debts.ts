import type { Database } from 'sql.js'
import { createIdFactory, nowIso } from '../ids.ts'
import type { Debt, IdFactory, NewDebt } from '../types.ts'
import { nullableTimestamp, queryOne, queryRows, required, runSql, safeInteger, timestamp, writeTransaction } from './common.ts'
import { isValidCivilDate } from '../../domain/dates.ts'
import { validateDebt } from '../../domain/validation.ts'

const mapDebt = (row: Record<string, unknown>): Debt => ({
  id: String(row.id), monthId: String(row.month_id), templateId: row.template_id == null ? null : String(row.template_id), concept: String(row.concept), dueDate: row.due_date == null ? null : String(row.due_date), amountCents: row.amount_cents == null ? null : safeInteger(row.amount_cents, 'amount_cents'), paidAt: nullableTimestamp(row.paid_at, 'paid_at'), createdAt: timestamp(row.created_at, 'created_at'), updatedAt: timestamp(row.updated_at, 'updated_at'),
})

const hasSortOrderColumn = (db: Database): boolean =>
  queryOne(db, "SELECT name FROM pragma_table_info('debts') WHERE name = 'sort_order'") !== undefined

const nextUpdatedAt = (current: string): string => {
  const now = nowIso()
  const currentMs = Date.parse(current)
  return Number.isFinite(currentMs) && now <= current
    ? new Date(currentMs + 1).toISOString()
    : now
}

const assertDueDateBelongsToMonth = (db: Database, monthId: string, dueDate: string | null | undefined): void => {
  if (dueDate == null) return
  if (!isValidCivilDate(dueDate)) throw new RangeError('Fecha de vencimiento inválida')
  const month = queryOne(db, 'SELECT year, month FROM months WHERE id = ?', [monthId])
  if (!month || !dueDate.startsWith(`${String(month.year).padStart(4, '0')}-${String(month.month).padStart(2, '0')}-`)) {
    throw new RangeError('Fecha de vencimiento fuera del mes')
  }
}

export class DebtsRepository {
  private readonly ids: IdFactory
  private readonly db: Database
  constructor(db: Database, ids?: IdFactory) { this.db = db; this.ids = createIdFactory(ids) }
  getById(id: string): Debt | undefined { const row = queryOne(this.db, 'SELECT * FROM debts WHERE id = ?', [id]); return row && mapDebt(row) }
  listByMonth(monthId: string): Debt[] {
    const order = hasSortOrderColumn(this.db)
      ? 'ORDER BY sort_order ASC, id ASC'
      : 'ORDER BY due_date IS NULL ASC, due_date ASC, id ASC'
    return queryRows(this.db, `SELECT * FROM debts WHERE month_id = ? ${order}`, [monthId]).map(mapDebt)
  }
  create(input: NewDebt): Debt {
    const id = input.id ?? this.ids(), createdAt = input.createdAt ?? nowIso(), updatedAt = input.updatedAt ?? createdAt
    const candidate = { ...input, id, createdAt, updatedAt }
    timestamp(createdAt, 'created_at'); timestamp(updatedAt, 'updated_at')
    if (!validateDebt(candidate).valid) throw new Error('Deuda inválida')
    assertDueDateBelongsToMonth(this.db, candidate.monthId, candidate.dueDate)
    return writeTransaction(this.db, () => {
      if (hasSortOrderColumn(this.db)) {
        const nextSortOrder = safeInteger(queryOne(this.db, 'SELECT COALESCE(MAX(sort_order), -1) + 1 AS sort_order FROM debts WHERE month_id = ?', [input.monthId])?.sort_order, 'sort_order')
        runSql(this.db, 'INSERT INTO debts(id, month_id, template_id, concept, due_date, amount_cents, paid_at, created_at, updated_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, input.monthId, input.templateId ?? null, input.concept.trim(), input.dueDate ?? null, input.amountCents, input.paidAt ?? null, createdAt, updatedAt, nextSortOrder])
      } else {
        runSql(this.db, 'INSERT INTO debts(id, month_id, template_id, concept, due_date, amount_cents, paid_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, input.monthId, input.templateId ?? null, input.concept.trim(), input.dueDate ?? null, input.amountCents, input.paidAt ?? null, createdAt, updatedAt])
      }
      return required(this.getById(id), 'debt')
    })
  }
  update(id: string, input: Partial<Omit<NewDebt, 'id' | 'monthId'>>): Debt {
    const current = required(this.getById(id), 'debt'), next = { ...current, ...input, id, updatedAt: nextUpdatedAt(current.updatedAt) }
    if (!validateDebt(next).valid) throw new Error('Deuda inválida')
    assertDueDateBelongsToMonth(this.db, next.monthId, next.dueDate)
    return writeTransaction(this.db, () => {
      runSql(this.db, 'UPDATE debts SET template_id = ?, concept = ?, due_date = ?, amount_cents = ?, paid_at = ?, updated_at = ? WHERE id = ?', [next.templateId ?? null, next.concept.trim(), next.dueDate ?? null, next.amountCents, next.paidAt ?? null, next.updatedAt, id])
      return required(this.getById(id), 'debt')
    })
  }
  delete(id: string): void { writeTransaction(this.db, () => { runSql(this.db, 'DELETE FROM debts WHERE id = ?', [id]) }) }

  reorder(monthId: string, ids: string[]): void {
    if (typeof monthId !== 'string' || !Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('Orden de deudas inválido')
    writeTransaction(this.db, () => {
      if (!queryOne(this.db, 'SELECT id FROM months WHERE id = ?', [monthId])) throw new Error('Orden de deudas inválido')
      const existing = queryRows(this.db, 'SELECT id FROM debts WHERE month_id = ?', [monthId])
      const existingIds = new Set(existing.map((row) => String(row.id)))
      if (existingIds.size !== ids.length || ids.some((id) => !existingIds.has(id))) throw new Error('Orden de deudas inválido')
      ids.forEach((id, sortOrder) => runSql(this.db, 'UPDATE debts SET sort_order = ? WHERE id = ? AND month_id = ?', [sortOrder, id, monthId]))
    })
  }
}
