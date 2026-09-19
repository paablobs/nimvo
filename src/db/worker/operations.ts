import type { Database } from 'sql.js'
import { createIdFactory } from '../ids.ts'
import type { IdFactory } from '../types.ts'
import { CategoriesRepository } from '../repositories/categories.ts'
import { DebtsRepository } from '../repositories/debts.ts'
import { ExpensesRepository } from '../repositories/expenses.ts'
import { HistoryRepository } from '../repositories/history.ts'
import { MonthsRepository } from '../repositories/months.ts'
import { TemplatesRepository } from '../repositories/templates.ts'
import { VaultRepository } from '../repositories/vault.ts'
import type { DomainOperation } from './protocol.ts'

export const executeOperation = (db: Database, operation: DomainOperation, ids?: IdFactory): unknown => {
  const factory = createIdFactory(ids)
  switch (operation.kind) {
    case 'vault.getCurrency': return new VaultRepository(db).getCurrency()
    case 'vault.setCurrency': return new VaultRepository(db).setCurrency(operation.currency)
    case 'months.list': return new MonthsRepository(db, factory).list()
    case 'months.get': return new MonthsRepository(db, factory).getById(operation.id)
    case 'months.create': return new MonthsRepository(db, factory).create(operation.year, operation.month, operation.initialAmountCents, operation.id)
    case 'months.update': return new MonthsRepository(db, factory).update(operation.id, operation.input)
    case 'months.delete': return new MonthsRepository(db, factory).delete(operation.id)
    case 'months.createWithDebts': return new MonthsRepository(db, factory).createWithDebts(operation.input)
    case 'months.createWithTemplates': return new MonthsRepository(db, factory).createWithTemplates(operation.input, operation.templateIds)
    case 'history.list': return new HistoryRepository(db).list()
    case 'categories.list': return new CategoriesRepository(db, factory).list(operation.includeArchived)
    case 'categories.get': return new CategoriesRepository(db, factory).getById(operation.id)
    case 'categories.create': return new CategoriesRepository(db, factory).create(operation.input)
    case 'categories.update': return new CategoriesRepository(db, factory).update(operation.id, operation.input)
    case 'categories.delete': return new CategoriesRepository(db, factory).delete(operation.id)
    case 'categories.archive': return new CategoriesRepository(db, factory).archive(operation.id)
    case 'categories.restore': return new CategoriesRepository(db, factory).restore(operation.id)
    case 'templates.list': return new TemplatesRepository(db, factory).list(operation.activeOnly)
    case 'templates.get': return new TemplatesRepository(db, factory).getById(operation.id)
    case 'templates.create': return new TemplatesRepository(db, factory).create(operation.input)
    case 'templates.update': return new TemplatesRepository(db, factory).update(operation.id, operation.input)
    case 'templates.delete': return new TemplatesRepository(db, factory).delete(operation.id)
    case 'templates.archive': return new TemplatesRepository(db, factory).archive(operation.id)
    case 'debts.list': return new DebtsRepository(db, factory).listByMonth(operation.monthId)
    case 'debts.get': return new DebtsRepository(db, factory).getById(operation.id)
    case 'debts.create': return new DebtsRepository(db, factory).create(operation.input)
    case 'debts.update': return new DebtsRepository(db, factory).update(operation.id, operation.input)
    case 'debts.delete': return new DebtsRepository(db, factory).delete(operation.id)
    case 'expenses.list': return new ExpensesRepository(db, factory).listByMonth(operation.monthId)
    case 'expenses.get': return new ExpensesRepository(db, factory).getById(operation.id)
    case 'expenses.create': return new ExpensesRepository(db, factory).create(operation.input)
    case 'expenses.update': return new ExpensesRepository(db, factory).update(operation.id, operation.input)
    case 'expenses.delete': return new ExpensesRepository(db, factory).delete(operation.id)
  }
}
