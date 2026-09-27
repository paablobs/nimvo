import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'
import { LocalDatabase } from '../database.ts'
import { DebtsRepository } from './debts.ts'
import { MonthsRepository } from './months.ts'
import { TemplatesRepository } from './templates.ts'
import { executeOperation } from '../worker/operations.ts'

const nodeCwd = (globalThis as typeof globalThis & { process?: { cwd(): string } }).process?.cwd() ?? '.'
const wasmPath = `${nodeCwd}/node_modules/sql.js/dist/sql-wasm.wasm`
const openDatabase = () => LocalDatabase.open(undefined, () => initSqlJs({ locateFile: () => wasmPath }))

describe('DebtsRepository', () => {
  it('keeps due dates inside the owning month on create and update', async () => {
    const db = await openDatabase()
    const month = new MonthsRepository(db.raw).create(2026, 9, 0, 'september')
    const debts = new DebtsRepository(db.raw)
    const debt = debts.create({ id: 'rent', monthId: month.id, templateId: null, concept: 'Rent', dueDate: '2026-09-30', amountCents: 100, paidAt: null })

    expect(() => debts.create({ id: 'outside', monthId: month.id, templateId: null, concept: 'Outside', dueDate: '2026-10-01', amountCents: 100, paidAt: null })).toThrow('fuera del mes')
    expect(() => debts.update(debt.id, { dueDate: '2026-08-31' })).toThrow('fuera del mes')
    expect(debts.getById(debt.id)).toMatchObject({ dueDate: '2026-09-30' })

    db.close()
  })

  it('validates generated debts and rolls back an invalid month creation', async () => {
    const db = await openDatabase()
    const templates = new TemplatesRepository(db.raw)
    const template = templates.create({ id: 'rent-template', concept: 'Rent', defaultAmountCents: 100, dueDay: 31, isActive: true })
    const months = new MonthsRepository(db.raw)
    const generated = months.createWithTemplates({ year: 2025, month: 2, initialAmountCents: 0 }, [template.id])
    expect(generated.debts[0]).toMatchObject({ dueDate: '2025-02-28' })

    expect(() => months.createWithDebts({ year: 2025, month: 3, initialAmountCents: 0, debts: [{ templateId: null, concept: 'Invalid', dueDate: '2025-04-01', amountCents: 100, paidAt: null }] })).toThrow('fuera del mes')
    expect(months.getByYearMonth(2025, 3)).toBeUndefined()

    db.close()
  })

  it('rejects month period changes that would strand debt due dates', async () => {
    const db = await openDatabase()
    const months = new MonthsRepository(db.raw)
    const month = months.create(2026, 9, 0, 'september')
    const debts = new DebtsRepository(db.raw)
    debts.create({ id: 'rent', monthId: month.id, templateId: null, concept: 'Rent', dueDate: '2026-09-30', amountCents: 100, paidAt: null })

    expect(() => months.update(month.id, { month: 10 })).toThrow('fuera del mes')
    expect(months.getById(month.id)).toMatchObject({ year: 2026, month: 9 })

    db.close()
  })

  it('allows income-only updates for legacy off-month debt dates', async () => {
    const db = await openDatabase()
    const months = new MonthsRepository(db.raw)
    const month = months.create(2026, 9, 0, 'september')
    const debts = new DebtsRepository(db.raw)
    debts.create({ id: 'legacy-rent', monthId: month.id, templateId: null, concept: 'Rent', dueDate: '2026-09-30', amountCents: 100, paidAt: null })
    db.raw.run('UPDATE debts SET due_date = ? WHERE id = ?', ['2026-08-31', 'legacy-rent'])

    expect(months.update(month.id, { initialAmountCents: 250 })).toMatchObject({ initialAmountCents: 250, year: 2026, month: 9 })
    expect(() => months.update(month.id, { month: 10 })).toThrow('fuera del mes')

    db.close()
  })

  it('creates an unknown debt amount from a template and lets it be filled later', async () => {
    const db = await openDatabase()
    const templates = new TemplatesRepository(db.raw)
    const template = templates.create({ id: 'unknown-template', concept: 'Variable', defaultAmountCents: null, dueDay: null, isActive: true })
    const months = new MonthsRepository(db.raw)

    const generated = months.createWithTemplates({ year: 2026, month: 9, initialAmountCents: 0 }, [template.id])
    expect(generated.debts[0]).toMatchObject({ concept: 'Variable', amountCents: null })

    const updated = new DebtsRepository(db.raw).update(generated.debts[0].id, { amountCents: 12500 })
    expect(updated.amountCents).toBe(12500)

    const priced = templates.create({ id: 'priced-template', concept: 'Rent', defaultAmountCents: 5000, dueDay: null, isActive: true })
    const cleared = months.createWithTemplates({ year: 2026, month: 10, initialAmountCents: 0 }, [{ templateId: priced.id, amountCents: null }])
    expect(cleared.debts[0].amountCents).toBeNull()
    const withDefault = months.createWithTemplates({ year: 2026, month: 11, initialAmountCents: 0 }, [priced.id])
    expect(withDefault.debts[0].amountCents).toBe(5000)

    const zero = templates.create({ id: 'zero-template', concept: 'Variable', defaultAmountCents: 0, dueDay: null, isActive: true })
    const unpriced = months.createWithTemplates({ year: 2026, month: 12, initialAmountCents: 0 }, [zero.id])
    expect(unpriced.debts[0].amountCents).toBeNull()
    db.close()
  })

  it('keeps a manual order per month and appends newly created debts', async () => {
    const db = await openDatabase()
    const months = new MonthsRepository(db.raw)
    const month = months.create(2026, 9, 0, 'september')
    const debts = new DebtsRepository(db.raw)
    debts.create({ id: 'late', monthId: month.id, templateId: null, concept: 'Late', dueDate: '2026-09-20', amountCents: 100, paidAt: null })
    debts.create({ id: 'early', monthId: month.id, templateId: null, concept: 'Early', dueDate: '2026-09-01', amountCents: 100, paidAt: null })
    debts.create({ id: 'without-date', monthId: month.id, templateId: null, concept: 'Without date', dueDate: null, amountCents: 100, paidAt: null })

    expect(debts.listByMonth(month.id).map((debt) => debt.id)).toEqual(['late', 'early', 'without-date'])
    executeOperation(db.raw, { kind: 'debts.reorder', monthId: month.id, ids: ['without-date', 'early', 'late'] })
    expect(debts.listByMonth(month.id).map((debt) => debt.id)).toEqual(['without-date', 'early', 'late'])

    const appended = debts.create({ id: 'new-early', monthId: month.id, templateId: null, concept: 'New early', dueDate: '2026-09-02', amountCents: 100, paidAt: null })
    expect(appended).toBeTruthy()
    expect(debts.listByMonth(month.id).map((debt) => debt.id)).toEqual(['without-date', 'early', 'late', 'new-early'])
    db.close()
  })

  it('rejects incomplete, duplicate, unknown, and cross-month debt orders atomically', async () => {
    const db = await openDatabase()
    const months = new MonthsRepository(db.raw)
    const month = months.create(2026, 9, 0, 'september')
    const otherMonth = months.create(2026, 10, 0, 'october')
    const debts = new DebtsRepository(db.raw)
    debts.create({ id: 'first', monthId: month.id, templateId: null, concept: 'First', dueDate: null, amountCents: 100, paidAt: null })
    debts.create({ id: 'second', monthId: month.id, templateId: null, concept: 'Second', dueDate: null, amountCents: 100, paidAt: null })
    debts.create({ id: 'other', monthId: otherMonth.id, templateId: null, concept: 'Other', dueDate: null, amountCents: 100, paidAt: null })

    const initial = debts.listByMonth(month.id).map((debt) => debt.id)
    for (const ids of [['first'], ['first', 'first'], ['first', 'missing'], ['first', 'other']]) {
      expect(() => debts.reorder(month.id, ids)).toThrow('Orden de deudas inválido')
      expect(debts.listByMonth(month.id).map((debt) => debt.id)).toEqual(initial)
    }
    db.close()
  })
})
