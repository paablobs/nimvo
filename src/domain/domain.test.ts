import { describe, expect, it } from 'vitest'
import { addCents, calculateMonthlySummary, isSafeCents, parseMoneyToCents, parseSignedMoneyToCents, validateDebt, validateExpense } from './index.ts'

describe('domain contracts', () => {
  it('rejects fractions and unsafe amounts', () => {
    expect(isSafeCents(1.5)).toBe(false)
    expect(isSafeCents(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
    expect(validateDebt({ id: 'd', monthId: 'm', concept: 'Rent', amountCents: 1.5, dueDate: null, templateId: null, paidAt: null }).valid).toBe(false)
    expect(validateExpense({ id: 'e', monthId: 'm', categoryId: 'c', spentOn: '2026-09-01', description: null, amountCents: Number.MAX_SAFE_INTEGER + 1 }).valid).toBe(false)
  })

  it('parses signed ARS amounts without allowing negative debt amounts', () => {
    expect(parseSignedMoneyToCents('1.234,56')).toBe(123456)
    expect(parseSignedMoneyToCents('-1.234,56')).toBe(-123456)
    expect(parseSignedMoneyToCents('-0,50')).toBe(-50)
    expect(parseMoneyToCents('-1.234,56')).toBeNull()
    expect(parseMoneyToCents('+1.234,56')).toBeNull()
    expect(parseSignedMoneyToCents('-90.071.992.547.409,92')).toBeNull()
  })

  it('counts only debts with paidAt as paid and detects signed overflow', () => {
    const result = calculateMonthlySummary({
      month: { initialAmountCents: -10 },
      debts: [{ amountCents: 5, paidAt: null }, { amountCents: 7, paidAt: '2026-09-01T00:00:00.000Z' }],
      expenses: [{ amountCents: 3 }],
    })
    expect(result).toEqual({ debtTotal: 12, debtPaid: 7, debtPending: 5, dailyExpenses: 3, balance: -25 })
    expect(() => addCents(Number.MAX_SAFE_INTEGER, 1)).toThrow(RangeError)
  })

  it('keeps the documented monthly totals exact when payment state changes', () => {
    const debts = [
      { amountCents: 200_000_000, paidAt: '2026-09-10T12:00:00.000Z' },
      { amountCents: 22_616_334, paidAt: null },
    ]
    const expenses = [{ amountCents: 10_000_000 }]

    expect(calculateMonthlySummary({
      month: { initialAmountCents: 350_000_000 },
      debts,
      expenses,
    })).toEqual({
      debtTotal: 222_616_334,
      debtPaid: 200_000_000,
      debtPending: 22_616_334,
      dailyExpenses: 10_000_000,
      balance: 117_383_666,
    })

    expect(calculateMonthlySummary({
      month: { initialAmountCents: 350_000_000 },
      debts: debts.map((debt) => ({ ...debt, paidAt: '2026-09-10T12:00:00.000Z' })),
      expenses,
    })).toMatchObject({
      debtPending: 0,
      balance: 117_383_666,
    })
  })
})
