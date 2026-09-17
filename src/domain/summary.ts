import { addCents, isSafeSignedCents } from './money.ts'
import type { Cents, Month } from './types.ts'

export interface MonthlySummary {
  debtTotal: Cents
  debtPaid: Cents
  debtPending: Cents
  dailyExpenses: Cents
  realBalance: Cents
  availableBalance: Cents
}

export interface MonthlySummaryInput {
  month?: Pick<Month, 'initialAmountCents'> | { initialAmount?: Cents; initialAmountCents?: Cents }
  initialBalance?: Cents
  initialBalanceCents?: Cents
  initialAmountCents?: Cents
  debts: readonly SummaryDebt[]
  expenses: readonly SummaryExpense[]
}

export type SummaryDebt = {
  amountCents?: Cents
  paidAt?: string | null
}

export type SummaryExpense = {
  amountCents?: Cents
  description?: string | null
}

function amountOf(value: { amountCents?: unknown; amount?: unknown }): Cents {
  const amount = value.amountCents
  if (!isSafeSignedCents(amount)) throw new RangeError('El importe debe ser un entero seguro en centavos')
  return amount
}

function paidOf(value: { paidAt?: unknown }): boolean {
  return value.paidAt != null
}

function addMany(values: readonly Cents[]): Cents {
  let total = 0
  for (const value of values) total = addCents(total, value)
  return total
}

export function calculateMonthlySummary(input: MonthlySummaryInput): MonthlySummary
export function calculateMonthlySummary(
  initialBalanceCents: Cents,
  debts: readonly SummaryDebt[],
  expenses: readonly SummaryExpense[],
): MonthlySummary
export function calculateMonthlySummary(
  month: MonthlySummaryInput['month'],
  debts: readonly SummaryDebt[],
  expenses: readonly SummaryExpense[],
): MonthlySummary
export function calculateMonthlySummary(
  inputOrMonth: MonthlySummaryInput | MonthlySummaryInput['month'] | Cents,
  debtsArg?: readonly SummaryDebt[],
  expensesArg?: readonly SummaryExpense[],
): MonthlySummary {
  const rootInput = typeof inputOrMonth === 'object' && inputOrMonth !== null
    ? inputOrMonth as MonthlySummaryInput
    : undefined
  const month = (typeof inputOrMonth === 'number'
    ? { initialAmountCents: inputOrMonth }
    : debtsArg && expensesArg && rootInput?.month === undefined
      ? rootInput
      : rootInput?.month) as {
    initialAmountCents?: unknown
    initialAmount?: unknown
  } | undefined
  const debts = debtsArg && expensesArg ? debtsArg : rootInput?.debts
  const expenses = debtsArg && expensesArg ? expensesArg : rootInput?.expenses
  const initialBalance = month?.initialAmountCents ?? month?.initialAmount ?? rootInput?.initialAmountCents ?? rootInput?.initialBalanceCents ?? rootInput?.initialBalance
  if (!isSafeSignedCents(initialBalance)) throw new RangeError('El saldo inicial debe ser un entero seguro en centavos')
  if (!debts || !expenses) throw new TypeError('Faltan deudas o gastos para calcular el resumen')

  const debtAmounts = debts.map(amountOf)
  const debtTotal = addMany(debtAmounts)
  const debtPaid = addMany(debts.filter(paidOf).map(amountOf))
  const debtPending = addCents(debtTotal, -debtPaid)
  const dailyExpenses = addMany(expenses.map(amountOf))
  const realBalance = addCents(addCents(initialBalance, -debtPaid), -dailyExpenses)
  const availableBalance = addCents(addCents(initialBalance, -debtTotal), -dailyExpenses)

  return { debtTotal, debtPaid, debtPending, dailyExpenses, realBalance, availableBalance }
}
