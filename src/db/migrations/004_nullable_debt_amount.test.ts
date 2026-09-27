import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { LocalDatabase } from '../database.ts'
import { DebtsRepository } from '../repositories/debts.ts'
import { MonthsRepository } from '../repositories/months.ts'
import { TemplatesRepository } from '../repositories/templates.ts'
import { migrateInitial } from './001_initial.ts'
import { migrateCurrency } from './002_currency.ts'
import { migrateTemplateOrder } from './003_template_order.ts'

const nodeCwd = (globalThis as typeof globalThis & { process?: { cwd(): string } }).process?.cwd() ?? '.'
const wasmPath = `${nodeCwd}/node_modules/sql.js/dist/sql-wasm.wasm`
const openDatabase = (bytes?: Uint8Array) => LocalDatabase.open(bytes, () => initSqlJs({ locateFile: () => wasmPath }))

describe('nullable debt amount migration', () => {
  it('preserves debts, foreign keys, the due-date index, and exported data', async () => {
    const SQL = await initSqlJs({ locateFile: () => wasmPath })
    const legacy = new SQL.Database()
    legacy.run('PRAGMA foreign_keys = ON')
    migrateInitial(legacy)
    migrateCurrency(legacy)
    migrateTemplateOrder(legacy)
    legacy.run('PRAGMA user_version = 3')
    const month = new MonthsRepository(legacy).create(2026, 9, 0, 'month')
    const template = new TemplatesRepository(legacy).create({ id: 'template', concept: 'Rent', defaultAmountCents: 100, dueDay: null, isActive: true })
    const debt = new DebtsRepository(legacy).create({ id: 'debt', monthId: month.id, templateId: template.id, concept: 'Rent', amountCents: 100, dueDate: null, paidAt: null })
    const exported = legacy.export()
    legacy.close()

    const reopened = await openDatabase(exported)
    expect(reopened.schemaVersion).toBe(5)
    expect(new DebtsRepository(reopened.raw).getById(debt.id)).toMatchObject({ amountCents: 100, templateId: template.id })
    expect(reopened.raw.exec("SELECT name FROM pragma_index_list('debts')")[0].values.flat()).toContain('idx_debts_month_due_date')
    expect(reopened.raw.exec('PRAGMA foreign_key_check')).toEqual([])
    const reopenedDebts = new DebtsRepository(reopened.raw)
    expect(reopenedDebts.create({ id: 'unknown', monthId: month.id, templateId: template.id, concept: 'Variable', amountCents: null, dueDate: null, paidAt: null }).amountCents).toBeNull()
    expect(() => reopenedDebts.create({ id: 'orphan', monthId: 'missing', templateId: null, concept: 'Orphan', amountCents: null, dueDate: null, paidAt: null })).toThrow()
    reopened.close()
  })
})
