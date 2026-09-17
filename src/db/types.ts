export type IdFactory = () => string

import type { Category, Debt, Expense, Month, RecurringDebtTemplate } from '../domain/types.ts'
import type { MonthlyHistoryRow } from '../domain/history.ts'

export type { Category, Debt, Expense, Month, MonthlyHistoryRow, RecurringDebtTemplate }

export type NewCategory = Omit<Category, 'id' | 'createdAt'> & Partial<Pick<Category, 'id' | 'createdAt'>>
export type NewTemplate = Omit<RecurringDebtTemplate, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<RecurringDebtTemplate, 'id' | 'createdAt' | 'updatedAt'>>
export type NewDebt = Omit<Debt, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<Debt, 'id' | 'createdAt' | 'updatedAt'>>
export type NewExpense = Omit<Expense, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<Expense, 'id' | 'createdAt' | 'updatedAt'>>

export type NewMonthWithDebts = {
  year: number
  month: number
  initialAmountCents: number
  currency?: string
  id?: string
  createdAt?: string
  debts?: Array<Omit<NewDebt, 'monthId'> & Partial<Pick<NewDebt, 'monthId'>>>
}

export type NewTemplateDebt = string | {
  templateId: string
  amountCents?: number
  dueDate?: string | null
}

export type MonthWithDebts = {
  month: Month
  debts: Debt[]
}
