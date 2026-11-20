import { addCents, isSafeSignedCents } from './money.ts'
import type { Cents } from './types.ts'
import type { CurrencyCode } from './currency.ts'

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
  currency: CurrencyCode
  initialAmountCents: Cents
  debtTotal: Cents
  debtPending: Cents
  dailyExpenses: Cents
  balance: Cents
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
export const calculateMonthlyHistoryBalances = (input: MonthlyHistoryBalanceInput): Pick<MonthlyHistoryRow, 'balance'> => {
  const initialAmountCents = amount(input.initialAmountCents, 'initial_amount_cents')
  const debtTotal = amount(input.debtTotal, 'debt_total')
  const debtPending = amount(input.debtPending, 'debt_pending')
  const dailyExpenses = amount(input.dailyExpenses, 'daily_expenses')
  if (debtTotal < 0 || debtPending < 0 || debtPending > debtTotal || dailyExpenses < 0) {
    throw new RangeError('Los totales del historial son inválidos')
  }

  return {
    balance: addCents(addCents(initialAmountCents, -debtTotal), -dailyExpenses),
  }
}

/**
 * Balance change of each history row against the immediately preceding
 * calendar month. Rows are ordered newest first. A row has no delta when the
 * month before it is not in the history (first month or a gap), so the change
 * is never attributed to the wrong month.
 */
export const calculateBalanceDeltas = (rows: readonly Pick<MonthlyHistoryRow, 'year' | 'month' | 'balance'>[]): (Cents | null)[] =>
  rows.map((row, index) => {
    const previous = rows[index + 1]
    if (!previous) return null
    const consecutive = row.year * 12 + row.month - (previous.year * 12 + previous.month) === 1
    return consecutive ? addCents(amount(row.balance, 'balance'), -amount(previous.balance, 'balance')) : null
  })

/** Total outgoing money for a month: fixed expenses plus daily expenses. */
export const totalSpending = (row: Pick<MonthlyHistoryRow, 'debtTotal' | 'dailyExpenses'>): Cents =>
  addCents(amount(row.debtTotal, 'debt_total'), amount(row.dailyExpenses, 'daily_expenses'))
