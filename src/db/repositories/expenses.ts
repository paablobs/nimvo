import type { Database } from 'sql.js'
import { createIdFactory, nowIso } from '../ids.ts'
import type { Expense, IdFactory, NewExpense } from '../types.ts'
import { queryOne, queryRows, required, runSql, safeInteger, timestamp, writeTransaction } from './common.ts'
import { isValidCivilDate } from '../../domain/dates.ts'
import { validateExpense } from '../../domain/validation.ts'

const mapExpense = (row: Record<string, unknown>): Expense => ({ id: String(row.id), monthId: String(row.month_id), categoryId: String(row.category_id), spentOn: String(row.spent_on), description: row.description == null ? null : String(row.description), amountCents: safeInteger(row.amount_cents, 'amount_cents'), createdAt: timestamp(row.created_at, 'created_at'), updatedAt: timestamp(row.updated_at, 'updated_at') })

const normalizeDescription = (description: unknown): string | null => {
  if (description == null) return null
  if (typeof description !== 'string') throw new TypeError('Descripción inválida')
  const trimmed = description.trim()
  return trimmed || null
}

const assertSpentOnBelongsToMonth = (db: Database, monthId: string, spentOn: string): void => {
  if (!isValidCivilDate(spentOn)) throw new RangeError('Fecha del gasto inválida')
  const month = queryOne(db, 'SELECT year, month FROM months WHERE id = ?', [monthId])
  if (!month || !spentOn.startsWith(`${String(month.year).padStart(4, '0')}-${String(month.month).padStart(2, '0')}-`)) {
    throw new RangeError('Fecha del gasto fuera del mes')
  }
}

const nextUpdatedAt = (current: string): string => {
  const now = nowIso()
  const currentMs = Date.parse(current)
  return Number.isFinite(currentMs) && now <= current
    ? new Date(currentMs + 1).toISOString()
    : now
}

export class ExpensesRepository {
  private readonly ids: IdFactory
  private readonly db: Database
  constructor(db: Database, ids?: IdFactory) { this.db = db; this.ids = createIdFactory(ids) }
  getById(id: string): Expense | undefined { const row = queryOne(this.db, 'SELECT * FROM expenses WHERE id = ?', [id]); return row && mapExpense(row) }
  listByMonth(monthId: string): Expense[] { return queryRows(this.db, 'SELECT * FROM expenses WHERE month_id = ? ORDER BY spent_on DESC, id DESC', [monthId]).map(mapExpense) }
  create(input: NewExpense): Expense {
    const id = input.id ?? this.ids(), createdAt = input.createdAt ?? nowIso(), updatedAt = input.updatedAt ?? createdAt
    const candidate = { ...input, id, createdAt, updatedAt, description: normalizeDescription(input.description) }
    timestamp(createdAt, 'created_at'); timestamp(updatedAt, 'updated_at')
    if (!validateExpense(candidate).valid) throw new Error('Gasto inválido')
    assertSpentOnBelongsToMonth(this.db, candidate.monthId, candidate.spentOn)
    return writeTransaction(this.db, () => {
      runSql(this.db, 'INSERT INTO expenses(id, month_id, category_id, spent_on, description, amount_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, candidate.monthId, candidate.categoryId, candidate.spentOn, candidate.description, candidate.amountCents, createdAt, updatedAt])
      return required(this.getById(id), 'expense')
    })
  }
  update(id: string, input: Partial<Omit<NewExpense, 'id' | 'monthId'>>): Expense {
    const current = required(this.getById(id), 'expense'), next = { ...current, ...input, id, description: normalizeDescription(input.description === undefined ? current.description : input.description), updatedAt: nextUpdatedAt(current.updatedAt) }
    if (!validateExpense(next).valid) throw new Error('Gasto inválido')
    assertSpentOnBelongsToMonth(this.db, next.monthId, next.spentOn)
    return writeTransaction(this.db, () => {
      runSql(this.db, 'UPDATE expenses SET category_id = ?, spent_on = ?, description = ?, amount_cents = ?, updated_at = ? WHERE id = ?', [next.categoryId, next.spentOn, next.description ?? null, next.amountCents, next.updatedAt, id])
      return required(this.getById(id), 'expense')
    })
  }
  delete(id: string): void { writeTransaction(this.db, () => { runSql(this.db, 'DELETE FROM expenses WHERE id = ?', [id]) }) }
}
