import type { Category, NewCategory, NewDebt, NewExpense, NewMonthWithDebts, NewTemplate, NewTemplateDebt } from '../types.ts'
import type { CurrencyCode } from '../../domain/currency.ts'

export type DomainOperation =
  | { kind: 'vault.getCurrency' }
  | { kind: 'vault.setCurrency'; currency: CurrencyCode }
  | { kind: 'months.list' }
  | { kind: 'months.get'; id: string }
  | { kind: 'months.create'; year: number; month: number; initialAmountCents: number; id?: string }
  | { kind: 'months.update'; id: string; input: { year?: number; month?: number; initialAmountCents?: number } }
  | { kind: 'months.delete'; id: string }
  | { kind: 'months.createWithDebts'; input: Omit<NewMonthWithDebts, 'createdAt'> }
  | { kind: 'months.createWithTemplates'; input: Omit<NewMonthWithDebts, 'debts' | 'createdAt'>; templateIds: NewTemplateDebt[] }
  | { kind: 'history.list' }
  | { kind: 'categories.list'; includeArchived?: boolean }
  | { kind: 'categories.get'; id: string }
  | { kind: 'categories.create'; input: Omit<NewCategory, 'createdAt'> }
  | { kind: 'categories.update'; id: string; input: Partial<Pick<Category, 'name' | 'colorToken' | 'isArchived'>> }
  | { kind: 'categories.delete'; id: string }
  | { kind: 'categories.archive'; id: string }
  | { kind: 'categories.restore'; id: string }
  | { kind: 'templates.list'; activeOnly?: boolean }
  | { kind: 'templates.get'; id: string }
  | { kind: 'templates.create'; input: Omit<NewTemplate, 'createdAt' | 'updatedAt'> }
  | { kind: 'templates.update'; id: string; input: Partial<Omit<NewTemplate, 'id' | 'createdAt' | 'updatedAt'>> }
  | { kind: 'templates.delete'; id: string }
  | { kind: 'templates.archive'; id: string }
  | { kind: 'debts.list'; monthId: string }
  | { kind: 'debts.get'; id: string }
  | { kind: 'debts.create'; input: Omit<NewDebt, 'createdAt' | 'updatedAt'> }
  | { kind: 'debts.update'; id: string; input: Partial<Omit<NewDebt, 'id' | 'monthId' | 'createdAt' | 'updatedAt'>> }
  | { kind: 'debts.delete'; id: string }
  | { kind: 'expenses.list'; monthId: string }
  | { kind: 'expenses.get'; id: string }
  | { kind: 'expenses.create'; input: Omit<NewExpense, 'createdAt' | 'updatedAt'> }
  | { kind: 'expenses.update'; id: string; input: Partial<Omit<NewExpense, 'id' | 'monthId' | 'createdAt' | 'updatedAt'>> }
  | { kind: 'expenses.delete'; id: string }

export type WorkerRequest =
  | { type: 'open'; requestId: string; bytes?: Uint8Array }
  | { type: 'export'; requestId: string }
  | { type: 'close'; requestId: string }
  | { type: 'operation'; requestId: string; operation: DomainOperation }

export type WorkerError = { code: 'constraint' | 'not_found' | 'closed' | 'database'; message: string }
export type WorkerResponse =
  | { type: 'success'; requestId: string; result: unknown }
  | { type: 'error'; requestId: string; error: WorkerError }
