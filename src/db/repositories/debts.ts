import type { Database } from 'sql.js'
import { createIdFactory, nowIso } from '../ids.ts'
import type { Debt, IdFactory, NewDebt } from '../types.ts'
import { nullableTimestamp, queryOne, queryRows, required, runSql, safeInteger, timestamp, writeTransaction } from './common.ts'
import { validateDebt } from '../../domain/validation.ts'

const mapDebt = (row: Record<string, unknown>): Debt => ({
  id: String(row.id), monthId: String(row.month_id), templateId: row.template_id == null ? null : String(row.template_id), concept: String(row.concept), dueDate: row.due_date == null ? null : String(row.due_date), amountCents: safeInteger(row.amount_cents, 'amount_cents'), paidAt: nullableTimestamp(row.paid_at, 'paid_at'), createdAt: timestamp(row.created_at, 'created_at'), updatedAt: timestamp(row.updated_at, 'updated_at'),
})

const nextUpdatedAt = (current: string): string => {
  const now = nowIso()
  const currentMs = Date.parse(current)
  return Number.isFinite(currentMs) && now <= current
    ? new Date(currentMs + 1).toISOString()
    : now
}

export class DebtsRepository {
  private readonly ids: IdFactory
  private readonly db: Database
  constructor(db: Database, ids?: IdFactory) { this.db = db; this.ids = createIdFactory(ids) }
  getById(id: string): Debt | undefined { const row = queryOne(this.db, 'SELECT * FROM debts WHERE id = ?', [id]); return row && mapDebt(row) }
  listByMonth(monthId: string): Debt[] { return queryRows(this.db, 'SELECT * FROM debts WHERE month_id = ? ORDER BY due_date IS NULL ASC, due_date ASC, id ASC', [monthId]).map(mapDebt) }
  create(input: NewDebt): Debt {
    const id = input.id ?? this.ids(), createdAt = input.createdAt ?? nowIso(), updatedAt = input.updatedAt ?? createdAt
    const candidate = { ...input, id, createdAt, updatedAt }
    timestamp(createdAt, 'created_at'); timestamp(updatedAt, 'updated_at')
    if (!validateDebt(candidate).valid) throw new Error('Deuda inválida')
    return writeTransaction(this.db, () => {
      runSql(this.db, 'INSERT INTO debts(id, month_id, template_id, concept, due_date, amount_cents, paid_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, input.monthId, input.templateId ?? null, input.concept.trim(), input.dueDate ?? null, input.amountCents, input.paidAt ?? null, createdAt, updatedAt])
      return required(this.getById(id), 'debt')
    })
  }
  update(id: string, input: Partial<Omit<NewDebt, 'id' | 'monthId'>>): Debt {
    const current = required(this.getById(id), 'debt'), next = { ...current, ...input, id, updatedAt: nextUpdatedAt(current.updatedAt) }
    if (!validateDebt(next).valid) throw new Error('Deuda inválida')
    return writeTransaction(this.db, () => {
      runSql(this.db, 'UPDATE debts SET template_id = ?, concept = ?, due_date = ?, amount_cents = ?, paid_at = ?, updated_at = ? WHERE id = ?', [next.templateId ?? null, next.concept.trim(), next.dueDate ?? null, next.amountCents, next.paidAt ?? null, next.updatedAt, id])
      return required(this.getById(id), 'debt')
    })
  }
  delete(id: string): void { writeTransaction(this.db, () => { runSql(this.db, 'DELETE FROM debts WHERE id = ?', [id]) }) }
}
