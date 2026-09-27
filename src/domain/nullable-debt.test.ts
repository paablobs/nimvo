import { describe, expect, it } from 'vitest'
import { calculateMonthlySummary } from './summary.ts'
import { validateDebt } from './validation.ts'

describe('unknown debt amounts', () => {
  it('accepts null as an unknown debt amount', () => {
    expect(validateDebt({ id: 'debt', monthId: 'month', concept: 'Variable', amountCents: null, templateId: null, dueDate: null, paidAt: null }).valid).toBe(true)
    expect(validateDebt({ id: 'debt', monthId: 'month', concept: 'Variable', amountCents: null, templateId: null, dueDate: null, paidAt: '2026-09-01T00:00:00.000Z' }).valid).toBe(false)
  })

  it('excludes unknown debts from numeric totals until an amount is entered', () => {
    expect(calculateMonthlySummary({
      month: { initialAmountCents: 1000 },
      debts: [{ amountCents: null, paidAt: null }, { amountCents: 200, paidAt: null }],
      expenses: [],
    })).toEqual({ debtTotal: 200, debtPaid: 0, debtPending: 200, dailyExpenses: 0, balance: 800 })
  })
})
