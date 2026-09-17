import { describe, expect, it } from 'vitest'
import initSqlJs from 'sql.js'
import { LocalDatabase } from '../database.ts'
import { CategoriesRepository } from './categories.ts'
import { DebtsRepository } from './debts.ts'
import { ExpensesRepository } from './expenses.ts'
import { HistoryRepository } from './history.ts'
import { MonthsRepository } from './months.ts'
import { executeOperation } from '../worker/operations.ts'
import { calculateMonthlyHistoryBalances, type MonthlyHistoryRow } from '../../domain/history.ts'

const nodeCwd = (globalThis as typeof globalThis & { process?: { cwd(): string } }).process?.cwd() ?? '.'
const wasmPath = `${nodeCwd}/node_modules/sql.js/dist/sql-wasm.wasm`
const openDatabase = (bytes?: Uint8Array) => LocalDatabase.open(bytes, () => initSqlJs({ locateFile: () => wasmPath }))

describe('history repository', () => {
  it('returns exact totals, archived category breakdowns, empty months and recent-first order', async () => {
    const db = await openDatabase()
    const categories = new CategoriesRepository(db.raw)
    const archived = categories.create({ id: 'archived', name: 'Comida', colorToken: null, isArchived: false })
    const current = categories.create({ id: 'current', name: 'Transporte', colorToken: null, isArchived: false })
    categories.archive(archived.id)
    const months = new MonthsRepository(db.raw)
    const september = months.create(2026, 9, 350_000_000, 'september')
    months.create(2026, 8, 50_000_000, 'august')
    const debts = new DebtsRepository(db.raw)
    debts.create({ id: 'paid', monthId: september.id, templateId: null, concept: 'Pagada', amountCents: 200_000_000, dueDate: null, paidAt: '2026-09-10T12:00:00.000Z' })
    debts.create({ id: 'pending', monthId: september.id, templateId: null, concept: 'Pendiente', amountCents: 22_616_334, dueDate: null, paidAt: null })
    const expenses = new ExpensesRepository(db.raw)
    expenses.create({ id: 'food-expense', monthId: september.id, categoryId: archived.id, spentOn: '2026-09-01', description: null, amountCents: 10_000_000 })
    expenses.create({ id: 'transport-expense', monthId: september.id, categoryId: current.id, spentOn: '2026-09-02', description: null, amountCents: 2_000_000 })

    const rows = new HistoryRepository(db.raw).list()
    expect(rows).toEqual([
      {
        monthId: 'september', year: 2026, month: 9, currency: 'ARS', initialAmountCents: 350_000_000,
        debtTotal: 222_616_334, debtPending: 22_616_334, dailyExpenses: 12_000_000,
        realBalance: 138_000_000, availableBalance: 115_383_666,
        categoryBreakdown: [
          { categoryId: 'archived', name: 'Comida', isArchived: true, amountCents: 10_000_000 },
          { categoryId: 'current', name: 'Transporte', isArchived: false, amountCents: 2_000_000 },
        ],
      },
      {
        monthId: 'august', year: 2026, month: 8, currency: 'ARS', initialAmountCents: 50_000_000,
        debtTotal: 0, debtPending: 0, dailyExpenses: 0, realBalance: 50_000_000, availableBalance: 50_000_000,
        categoryBreakdown: [],
      },
    ] satisfies MonthlyHistoryRow[])

    const operationRows = executeOperation(db.raw, { kind: 'history.list' }) as MonthlyHistoryRow[]
    expect(operationRows).toEqual(rows)
    const reopened = await openDatabase(db.export())
    expect(new HistoryRepository(reopened.raw).list()).toEqual(rows)
    db.close()
    reopened.close()
  })

  it('moves a debt between pending and paid balances without changing available balance', async () => {
    const db = await openDatabase()
    const month = new MonthsRepository(db.raw).create(2026, 9, 100, 'month')
    const debt = new DebtsRepository(db.raw).create({ id: 'debt', monthId: month.id, templateId: null, concept: 'Cuota', amountCents: 40, dueDate: null, paidAt: null })
    const debts = new DebtsRepository(db.raw)
    const unpaid = new HistoryRepository(db.raw).list()[0]
    debts.update(debt.id, { paidAt: '2026-09-01T00:00:00.000Z' })
    const paid = new HistoryRepository(db.raw).list()[0]
    expect(unpaid).toMatchObject({ debtTotal: 40, debtPending: 40, realBalance: 100, availableBalance: 60 })
    expect(paid).toMatchObject({ debtTotal: 40, debtPending: 0, realBalance: 60, availableBalance: 60 })
    db.close()
  })

  it('rejects overflow in derived balances', () => {
    expect(() => calculateMonthlyHistoryBalances({
      initialAmountCents: -Number.MAX_SAFE_INTEGER,
      debtTotal: 1,
      debtPending: 0,
      dailyExpenses: 0,
    })).toThrow(RangeError)
  })
})
