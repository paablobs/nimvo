import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { LocalDatabase } from '../database.ts'
import { DebtsRepository } from '../repositories/debts.ts'
import { MonthsRepository } from '../repositories/months.ts'
import { migrateInitial } from './001_initial.ts'
import { migrateCurrency } from './002_currency.ts'
import { migrateTemplateOrder } from './003_template_order.ts'
import { migrateNullableDebtAmount } from './004_nullable_debt_amount.ts'

const nodeCwd = (globalThis as typeof globalThis & { process?: { cwd(): string } }).process?.cwd() ?? '.'
const wasmPath = `${nodeCwd}/node_modules/sql.js/dist/sql-wasm.wasm`
const openDatabase = (bytes?: Uint8Array) => LocalDatabase.open(bytes, () => initSqlJs({ locateFile: () => wasmPath }))

describe('debt order migration', () => {
  it('backfills v4 debt order and preserves it through export and reopen', async () => {
    const SQL = await initSqlJs({ locateFile: () => wasmPath })
    const legacy = new SQL.Database()
    legacy.run('PRAGMA foreign_keys = ON')
    migrateInitial(legacy)
    migrateCurrency(legacy)
    migrateTemplateOrder(legacy)
    migrateNullableDebtAmount(legacy)
    legacy.run('PRAGMA user_version = 4')

    const month = new MonthsRepository(legacy).create(2026, 9, 0, 'september')
    const debts = new DebtsRepository(legacy)
    debts.create({ id: 'z-null', monthId: month.id, templateId: null, concept: 'No date', dueDate: null, amountCents: 100, paidAt: null })
    debts.create({ id: 'b-date', monthId: month.id, templateId: null, concept: 'Later', dueDate: '2026-09-20', amountCents: 100, paidAt: null })
    debts.create({ id: 'c-tie', monthId: month.id, templateId: null, concept: 'Tie C', dueDate: '2026-09-05', amountCents: 100, paidAt: null })
    debts.create({ id: 'a-tie', monthId: month.id, templateId: null, concept: 'Tie A', dueDate: '2026-09-05', amountCents: 100, paidAt: null })

    const migrated = await openDatabase(legacy.export())
    expect(migrated.schemaVersion).toBe(5)
    expect(new DebtsRepository(migrated.raw).listByMonth(month.id).map((debt) => debt.id)).toEqual(['a-tie', 'c-tie', 'b-date', 'z-null'])
    expect(migrated.raw.exec("SELECT name FROM pragma_index_list('debts')")[0].values.flat()).toContain('idx_debts_month_sort_order')

    const reopened = await openDatabase(migrated.export())
    expect(new DebtsRepository(reopened.raw).listByMonth(month.id).map((debt) => debt.id)).toEqual(['a-tie', 'c-tie', 'b-date', 'z-null'])
    legacy.close()
    migrated.close()
    reopened.close()
  })
})
