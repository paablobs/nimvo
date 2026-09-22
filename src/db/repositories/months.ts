import type { Database } from 'sql.js'
import { createIdFactory, nowIso } from '../ids.ts'
import type { IdFactory, Month, NewMonthWithDebts, NewTemplateDebt, MonthWithDebts } from '../types.ts'
import { queryOne, queryRows, required, runSql, safeInteger, timestamp, writeTransaction } from './common.ts'
import { DebtsRepository } from './debts.ts'
import { TemplatesRepository } from './templates.ts'
import { adjustDueDayToMonth, isValidCivilDate } from '../../domain/dates.ts'
import { VaultRepository } from './vault.ts'
import { parseCurrencyCode } from '../../domain/currency.ts'

const validateMonthInput = (input: Pick<NewMonthWithDebts, 'year' | 'month' | 'initialAmountCents'>): void => {
  safeInteger(input.year, 'year')
  safeInteger(input.month, 'month')
  safeInteger(input.initialAmountCents, 'initial_amount_cents')
  if (input.year < 1 || input.year > 9999) throw new RangeError('year inválido')
  if (input.month < 1 || input.month > 12) throw new RangeError('month inválido')
}

const validateTemplateInputs = (year: number, month: number, entries: NewTemplateDebt[]): void => {
  if (!Array.isArray(entries)) throw new TypeError('Plantillas inválidas')
  for (const entry of entries) {
    if (typeof entry === 'string') continue
    if (!entry || typeof entry.templateId !== 'string' || entry.templateId.trim() === '') throw new TypeError('Plantilla inválida')
    if (entry.amountCents !== undefined && (!Number.isSafeInteger(entry.amountCents) || entry.amountCents <= 0)) throw new RangeError('El importe de reemplazo debe ser un entero seguro positivo')
    if (entry.dueDate !== undefined && entry.dueDate !== null) {
      if (!isValidCivilDate(entry.dueDate) || !entry.dueDate.startsWith(`${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-`)) {
        throw new RangeError('Fecha de vencimiento fuera del mes creado')
      }
    }
  }
}

const assertDebtDueDatesBelongToPeriod = (db: Database, monthId: string, year: number, month: number): void => {
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-`
  const dueDates = queryRows(db, 'SELECT due_date FROM debts WHERE month_id = ? AND due_date IS NOT NULL', [monthId])
  if (dueDates.some((row) => typeof row.due_date !== 'string' || !row.due_date.startsWith(prefix))) {
    throw new RangeError('Fecha de vencimiento fuera del mes')
  }
}

const mapMonth = (row: Record<string, unknown>): Month => ({
  id: String(row.id), year: safeInteger(row.year, 'year'), month: safeInteger(row.month, 'month'),
  initialAmountCents: safeInteger(row.initial_amount_cents, 'initial_amount_cents'), currency: parseCurrencyCode(row.currency),
  createdAt: timestamp(row.created_at, 'created_at'), updatedAt: timestamp(row.updated_at, 'updated_at'),
})

export class MonthsRepository {
  private readonly ids: IdFactory
  private readonly db: Database
  constructor(db: Database, ids?: IdFactory) { this.db = db; this.ids = createIdFactory(ids) }

  getById(id: string): Month | undefined { const row = queryOne(this.db, 'SELECT * FROM months WHERE id = ?', [id]); return row && mapMonth(row) }
  getByYearMonth(year: number, month: number): Month | undefined { const row = queryOne(this.db, 'SELECT * FROM months WHERE year = ? AND month = ?', [year, month]); return row && mapMonth(row) }
  list(): Month[] { return queryRows(this.db, 'SELECT * FROM months ORDER BY year DESC, month DESC').map(mapMonth) }

  create(year: number, month: number, initialAmountCents: number, id = this.ids(), createdAt = nowIso(), updatedAt = createdAt): Month {
    validateMonthInput({ year, month, initialAmountCents }); timestamp(createdAt, 'created_at'); timestamp(updatedAt, 'updated_at')
    const currency = new VaultRepository(this.db).getCurrency()
    return writeTransaction(this.db, () => {
      runSql(this.db, 'INSERT INTO months(id, year, month, initial_amount_cents, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, year, month, initialAmountCents, currency, createdAt, updatedAt])
      return required(this.getById(id), 'month')
    })
  }

  update(id: string, input: Partial<Pick<Month, 'year' | 'month' | 'initialAmountCents'>>): Month {
    const current = required(this.getById(id), 'month')
    const next = { ...current, ...input, currency: new VaultRepository(this.db).getCurrency() }
    validateMonthInput(next)
    return writeTransaction(this.db, () => {
      if (next.year !== current.year || next.month !== current.month) assertDebtDueDatesBelongToPeriod(this.db, id, next.year, next.month)
      runSql(this.db, 'UPDATE months SET year = ?, month = ?, initial_amount_cents = ?, currency = ?, updated_at = ? WHERE id = ?', [next.year, next.month, next.initialAmountCents, next.currency, nowIso(), id])
      return required(this.getById(id), 'month')
    })
  }
  delete(id: string): void { writeTransaction(this.db, () => { runSql(this.db, 'DELETE FROM months WHERE id = ?', [id]) }) }

  createWithDebts(input: NewMonthWithDebts): MonthWithDebts {
    validateMonthInput(input)
    const existing = this.getByYearMonth(input.year, input.month)
    if (existing) return { month: existing, debts: new DebtsRepository(this.db, this.ids).listByMonth(existing.id) }
    return writeTransaction(this.db, () => {
      const month = this.create(input.year, input.month, input.initialAmountCents, input.id ?? this.ids(), input.createdAt ?? nowIso())
      const debts = (input.debts ?? []).map((debt) => new DebtsRepository(this.db, this.ids).create({ ...debt, monthId: month.id }))
      return { month, debts }
    })
  }

  createWithTemplates(input: Omit<NewMonthWithDebts, 'debts'>, templateIds: NewTemplateDebt[]): MonthWithDebts {
    validateMonthInput(input)
    validateTemplateInputs(input.year, input.month, templateIds)
    const existing = this.getByYearMonth(input.year, input.month)
    if (existing) return { month: existing, debts: new DebtsRepository(this.db, this.ids).listByMonth(existing.id) }
    return writeTransaction(this.db, () => {
      const month = this.create(input.year, input.month, input.initialAmountCents, input.id ?? this.ids(), input.createdAt ?? nowIso())
      const templates = new TemplatesRepository(this.db, this.ids)
      const debtsRepository = new DebtsRepository(this.db, this.ids)
      const debts = templateIds.map((entry) => {
        const templateId = typeof entry === 'string' ? entry : entry.templateId
        const override = typeof entry === 'string' ? undefined : entry.amountCents
        const template = required(templates.getById(templateId), 'recurring debt template')
        const amountCents: number = override ?? template.defaultAmountCents ?? 0
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new RangeError('La plantilla requiere un importe positivo')
        const dueDate = typeof entry === 'string' ? (template.dueDay === null ? null : `${input.year.toString().padStart(4, '0')}-${input.month.toString().padStart(2, '0')}-${adjustDueDayToMonth(template.dueDay, input.year, input.month).toString().padStart(2, '0')}`) : entry.dueDate === undefined ? (template.dueDay === null ? null : `${input.year.toString().padStart(4, '0')}-${input.month.toString().padStart(2, '0')}-${adjustDueDayToMonth(template.dueDay ?? 1, input.year, input.month).toString().padStart(2, '0')}`) : entry.dueDate
        return debtsRepository.create({ monthId: month.id, templateId, concept: template.concept, amountCents, dueDate, paidAt: null })
      })
      return { month, debts }
    })
  }
}
