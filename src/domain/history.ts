import { addCents, isSafeSignedCents } from './money.ts'
import type { Cents } from './types.ts'

export interface CategoryBreakdown {
  categoryId: string
  name: string
  isArchived: boolean
  amountCents: Cents
}

export interface MonthlyHistoryRow {
  monthId: string
  year: number
  month: number
  currency: string
  initialAmountCents: Cents
  debtTotal: Cents
  debtPending: Cents
  dailyExpenses: Cents
  realBalance: Cents
  availableBalance: Cents
  categoryBreakdown: CategoryBreakdown[]
}

export type MonthlyHistoryBalanceInput = Pick<
  MonthlyHistoryRow,
  'initialAmountCents' | 'debtTotal' | 'debtPending' | 'dailyExpenses'
>

const amount = (value: unknown, field: string): Cents => {
  if (!isSafeSignedCents(value)) throw new RangeError(`${field} debe ser un entero seguro`)
  return value
}

/** Calculates history balances from already aggregated, validated amounts. */
export const calculateMonthlyHistoryBalances = (input: MonthlyHistoryBalanceInput): Pick<MonthlyHistoryRow, 'realBalance' | 'availableBalance'> => {
  const initialAmountCents = amount(input.initialAmountCents, 'initial_amount_cents')
  const debtTotal = amount(input.debtTotal, 'debt_total')
  const debtPending = amount(input.debtPending, 'debt_pending')
  const dailyExpenses = amount(input.dailyExpenses, 'daily_expenses')
  if (debtTotal < 0 || debtPending < 0 || debtPending > debtTotal || dailyExpenses < 0) {
    throw new RangeError('Los totales del historial son inválidos')
  }

  const debtPaid = addCents(debtTotal, -debtPending)
  return {
    realBalance: addCents(addCents(initialAmountCents, -debtPaid), -dailyExpenses),
    availableBalance: addCents(addCents(initialAmountCents, -debtTotal), -dailyExpenses),
  }
}
