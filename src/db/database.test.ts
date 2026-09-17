import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { LocalDatabase } from './database.ts'
import { CategoriesRepository } from './repositories/categories.ts'
import { DebtsRepository } from './repositories/debts.ts'
import { ExpensesRepository } from './repositories/expenses.ts'
import { MonthsRepository } from './repositories/months.ts'
import { TemplatesRepository } from './repositories/templates.ts'
import { replaceDatabase } from './worker/runtime.ts'
import { calculateMonthlySummary } from '../domain/summary.ts'

const nodeCwd = (globalThis as typeof globalThis & { process?: { cwd(): string } }).process?.cwd() ?? '.'
const wasmPath = `${nodeCwd}/node_modules/sql.js/dist/sql-wasm.wasm`
const openDatabase = (bytes?: Uint8Array) => LocalDatabase.open(bytes, () => initSqlJs({ locateFile: () => wasmPath }))

describe('local database v1', () => {
  it('uses the exact schema and reopens exported bytes', async () => {
    const db = await openDatabase()
    expect(db.raw.exec('PRAGMA foreign_keys')[0].values[0][0]).toBe(1)
    expect(db.raw.exec('PRAGMA user_version')[0].values[0][0]).toBe(1)
    expect(db.raw.exec("SELECT value FROM app_meta WHERE key = 'schema_version'")[0].values[0][0]).toBe('1')
    expect(db.raw.exec("SELECT name FROM pragma_table_info('months')")[0].values.flat()).toEqual(['id', 'year', 'month', 'initial_amount_cents', 'currency', 'created_at', 'updated_at'])
    expect(db.raw.exec("SELECT name FROM pragma_index_list('expenses')")[0].values.flat()).toEqual(expect.arrayContaining(['idx_expenses_category_id', 'idx_expenses_month_spent_on']))
    const ids = (() => { let n = 0; return () => `id-${++n}` })()
    const categories = new CategoriesRepository(db.raw, ids)
    const category = categories.create({ id: 'category', name: '  Casa ', colorToken: 'blue', isArchived: false })
    expect(category.name).toBe('Casa')
    expect(() => categories.create({ id: 'category-2', name: 'cAsA', colorToken: 'red', isArchived: false })).toThrow()
    const months = new MonthsRepository(db.raw, ids)
    const month = months.create(2026, 9, -100, 'month')
    const templates = new TemplatesRepository(db.raw, ids)
    const template = templates.create({ id: 'template', concept: 'Alquiler', defaultAmountCents: 5000, dueDay: 31, isActive: true })
    const debts = new DebtsRepository(db.raw, ids)
    debts.create({ monthId: month.id, templateId: template.id, concept: template.concept, amountCents: 5000, dueDate: '2026-09-30', paidAt: null })
    const expenses = new ExpensesRepository(db.raw, ids)
    expenses.create({ monthId: month.id, categoryId: category.id, spentOn: '2026-09-03', description: 'Super', amountCents: 1000 })
    const bytes = db.export()
    db.close()
    const reopened = await openDatabase(bytes)
    expect(new MonthsRepository(reopened.raw).getByYearMonth(2026, 9)?.initialAmountCents).toBe(-100)
    reopened.close()
  })

  it('keeps archived category history and validates expense CRUD', async () => {
    const db = await openDatabase()
    const categories = new CategoriesRepository(db.raw)
    const category = categories.create({ id: 'food', name: '  Comida  ', colorToken: 'red', isArchived: false })
    const other = categories.create({ id: 'other', name: 'Transporte', colorToken: 'blue', isArchived: false })
    expect(() => categories.create({ id: 'duplicate', name: ' comida ', colorToken: 'green', isArchived: false })).toThrow()
    expect(categories.update(other.id, { name: '  Transporte diario  ' }).name).toBe('Transporte diario')
    expect(() => categories.update(other.id, { name: ' COMIDA ' })).toThrow()

    const month = new MonthsRepository(db.raw).create(2026, 9, 0, 'september')
    const expenses = new ExpensesRepository(db.raw)
    const first = expenses.create({ id: 'expense-1', monthId: month.id, categoryId: category.id, spentOn: '2026-09-03', description: '  Almuerzo  ', amountCents: 100, createdAt: '2026-01-01T00:00:00.000Z' })
    expenses.create({ id: 'expense-2', monthId: month.id, categoryId: category.id, spentOn: '2026-09-03', description: null, amountCents: 200 })
    expenses.create({ id: 'expense-3', monthId: month.id, categoryId: category.id, spentOn: '2026-09-02', description: 'Otro', amountCents: 300 })
    expect(first.description).toBe('Almuerzo')
    expect(expenses.listByMonth(month.id).map((expense) => expense.id)).toEqual(['expense-2', 'expense-1', 'expense-3'])
    expect(() => expenses.create({ id: 'outside', monthId: month.id, categoryId: category.id, spentOn: '2026-10-01', description: null, amountCents: 1 })).toThrow()

    const updated = expenses.update(first.id, { amountCents: 150, description: '   ' })
    expect(updated).toMatchObject({ amountCents: 150, description: null })
    expect(updated.updatedAt).not.toBe(first.updatedAt)
    expect(() => expenses.update(first.id, { spentOn: '2026-08-31' })).toThrow()

    expect(categories.archive(category.id).isArchived).toBe(true)
    expect(categories.list()).toEqual([expect.objectContaining({ id: other.id })])
    expect(categories.list(true).map((entry) => entry.id)).toEqual(['food', 'other'])
    expect(expenses.getById(first.id)).toBeTruthy()
    expect(() => categories.delete(category.id)).toThrow()
    expenses.delete(first.id)
    expect(expenses.getById(first.id)).toBeUndefined()
    db.close()
  })

  it('rolls back atomic month creation and enforces foreign keys', async () => {
    const db = await openDatabase()
    const months = new MonthsRepository(db.raw)
    expect(() => months.createWithDebts({ year: 2026, month: 10, initialAmountCents: 0, debts: [{ monthId: 'ignored', templateId: null, concept: 'invalid', dueDate: null, amountCents: 1.5, paidAt: null }] })).toThrow()
    expect(months.getByYearMonth(2026, 10)).toBeUndefined()
    expect(() => new DebtsRepository(db.raw).create({ monthId: 'missing', templateId: null, concept: 'x', dueDate: null, amountCents: 1, paidAt: null })).toThrow()
    db.close()
  })

  it('snapshots templates, clamps day 31 and keeps list order', async () => {
    const db = await openDatabase()
    const templates = new TemplatesRepository(db.raw)
    const template = templates.create({ id: 't', concept: 'Cuota', defaultAmountCents: 10, dueDay: 31, isActive: true })
    const months = new MonthsRepository(db.raw)
    const result = months.createWithTemplates({ year: 2025, month: 2, initialAmountCents: 0 }, [template.id])
    templates.update(template.id, { concept: 'Editada', defaultAmountCents: 20 })
    const snapshot = new DebtsRepository(db.raw).getById(result.debts[0].id)
    expect(snapshot).toMatchObject({ concept: 'Cuota', amountCents: 10, dueDate: '2025-02-28' })
    db.close()
  })

  it('validates template overrides and keeps duplicate month creation idempotent', async () => {
    const db = await openDatabase()
    const templates = new TemplatesRepository(db.raw)
    const template = templates.create({ id: 't', concept: 'Cuota', defaultAmountCents: 10, dueDay: 31, isActive: true })
    const months = new MonthsRepository(db.raw)
    expect(() => months.createWithTemplates({ year: 2025, month: 2, initialAmountCents: 0 }, [{ templateId: template.id, amountCents: 0 }])).toThrow()
    expect(() => months.createWithTemplates({ year: 2025, month: 2, initialAmountCents: 0 }, [{ templateId: template.id, dueDate: '2025-03-01' }])).toThrow()
    const created = months.createWithTemplates({ year: 2025, month: 2, initialAmountCents: 0 }, [{ templateId: template.id, amountCents: 20, dueDate: null }])
    const duplicate = months.createWithTemplates({ year: 2025, month: 2, initialAmountCents: 0 }, [template.id])
    expect(duplicate.month.id).toBe(created.month.id)
    expect(duplicate.debts).toHaveLength(1)
    expect(db.raw.exec('SELECT COUNT(*) FROM debts')[0].values[0][0]).toBe(1)
    const firstWithDebt = months.createWithDebts({ year: 2025, month: 3, initialAmountCents: 0, debts: [{ monthId: 'ignored', templateId: null, concept: 'Otra', amountCents: 5, dueDate: null, paidAt: null }] })
    const duplicateWithDebt = months.createWithDebts({ year: 2025, month: 3, initialAmountCents: 0, debts: [{ monthId: 'ignored', templateId: null, concept: 'No crear', amountCents: 6, dueDate: null, paidAt: null }] })
    expect(duplicateWithDebt.month.id).toBe(firstWithDebt.month.id)
    expect(duplicateWithDebt.debts.map((debt) => debt.concept)).toEqual(['Otra'])
    expect(db.raw.exec('SELECT COUNT(*) FROM debts')[0].values[0][0]).toBe(2)
    db.close()
  })

  it('updates template activity and debt paidAt without changing available balance', async () => {
    const db = await openDatabase()
    const templates = new TemplatesRepository(db.raw)
    const template = templates.create({ id: 't', concept: 'Cuota', defaultAmountCents: 10, dueDay: null, isActive: true })
    expect(templates.update(template.id, { isActive: false }).isActive).toBe(false)
    expect(templates.list(true)).toEqual([])
    const months = new MonthsRepository(db.raw)
    const month = months.create(2026, 9, 100, 'm')
    const debts = new DebtsRepository(db.raw)
    const debt = debts.create({ id: 'd', monthId: month.id, templateId: template.id, concept: 'Cuota', amountCents: 40, dueDate: null, paidAt: null, createdAt: '2020-01-01T00:00:00.000Z' })
    const paid = debts.update(debt.id, { paidAt: '2026-09-01T00:00:00.000Z' })
    expect(paid.paidAt).toBe('2026-09-01T00:00:00.000Z')
    expect(paid.updatedAt).not.toBe(debt.updatedAt)
    const unpaidSummary = calculateMonthlySummary({ month, debts: [debt], expenses: [] })
    const paidSummary = calculateMonthlySummary({ month, debts: [paid], expenses: [] })
    expect(paidSummary.availableBalance).toBe(unpaidSummary.availableBalance)
    db.close()
  })

  it('keeps two months through ordering, export and reopen', async () => {
    const db = await openDatabase()
    const months = new MonthsRepository(db.raw)
    months.create(2025, 12, 0, 'dec')
    months.create(2026, 1, 0, 'jan')
    expect(months.list().map((month) => month.id)).toEqual(['jan', 'dec'])
    const reopened = await openDatabase(db.export())
    expect(new MonthsRepository(reopened.raw).list().map((month) => month.id)).toEqual(['jan', 'dec'])
    db.close(); reopened.close()
  })

  it('does not discard the active database when opening a candidate fails', async () => {
    const active = await openDatabase()
    await expect(replaceDatabase(active, undefined, async () => { throw new Error('bad database') })).rejects.toThrow('bad database')
    expect(active.raw.exec('SELECT 1')[0].values[0][0]).toBe(1)
    active.close()
  })
})
