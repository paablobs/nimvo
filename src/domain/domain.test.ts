import { describe, expect, it } from 'vitest'
import { displayCivilDate, formatCivilDate } from './dates.ts'
import { buildChartSlots, calculateBalanceDeltas, totalSpending, type MonthlyHistoryRow } from './history.ts'
import { addCents, calculateMonthlySummary, formatCurrency, isSafeCents, parseMoneyToCents, parseSignedMoneyToCents, validateDebt, validateExpense } from './index.ts'

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
    expect(parseSignedMoneyToCents('1,234.56', 'es-AR')).toBe(123456)
    expect(parseSignedMoneyToCents('1.234,56', 'en-US')).toBe(123456)
  })

  it('formats each supported currency with its catalog symbol', () => {
    expect(formatCurrency(12345, 'ARS', { locale: 'en-US' })).toBe('$\u00a0123.45')
    expect(formatCurrency(12345, 'USD', { locale: 'en-US' })).toBe('$\u00a0123.45')
    expect(formatCurrency(12345, 'EUR', { locale: 'es-AR' })).toBe('€\u00a0123,45')
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

describe('formatCivilDate', () => {
  it('formats the calendar date without shifting by time zone', () => {
    expect(formatCivilDate('2026-10-05', 'en-US')).toBe('Oct 5, 2026')
    expect(formatCivilDate('2026-01-01', 'es-AR')).toMatch(/^1 ene\.? 2026$|^1 de ene\.? de 2026$/)
  })

  it('rejects invalid civil dates', () => {
    expect(() => formatCivilDate('2026-02-30', 'en-US')).toThrow(RangeError)
  })
})

describe('history comparisons', () => {
  it('computes the balance change against the previous month, newest first', () => {
    expect(calculateBalanceDeltas([
      { year: 2026, month: 9, balance: 90_000 },
      { year: 2026, month: 8, balance: -11_000 },
      { year: 2026, month: 7, balance: 5_000 },
    ])).toEqual([101_000, -16_000, null])
    expect(calculateBalanceDeltas([])).toEqual([])
  })

  it('compares across a year boundary', () => {
    expect(calculateBalanceDeltas([{ year: 2026, month: 1, balance: 10 }, { year: 2025, month: 12, balance: 25 }])).toEqual([-15, null])
  })

  it('omits the change when the previous calendar month is missing', () => {
    expect(calculateBalanceDeltas([{ year: 2026, month: 3, balance: 10 }, { year: 2026, month: 1, balance: 25 }])).toEqual([null, null])
  })

  it('rejects unsafe balances', () => {
    expect(() => calculateBalanceDeltas([{ year: 2026, month: 2, balance: 1.5 }, { year: 2026, month: 1, balance: 1 }])).toThrow(RangeError)
  })

  it('adds fixed and daily expenses for total spending', () => {
    expect(totalSpending({ debtTotal: 80_000, dailyExpenses: 30_000 })).toBe(110_000)
  })
})

describe('displayCivilDate', () => {
  it('formats valid dates and shows malformed stored values unchanged instead of throwing', () => {
    expect(displayCivilDate('2026-10-05', 'en-US')).toBe('Oct 5, 2026')
    expect(displayCivilDate('2026-02-30', 'en-US')).toBe('2026-02-30')
    expect(displayCivilDate('not a date', 'es-AR')).toBe('not a date')
  })
})

describe('buildChartSlots', () => {
  const row = (year: number, month: number): MonthlyHistoryRow => ({
    monthId: `${year}-${month}`, year, month, currency: 'ARS', initialAmountCents: 0, debtTotal: 0, debtPending: 0, dailyExpenses: 0, balance: 0, categoryBreakdown: [],
  })
  const labels = (rows: MonthlyHistoryRow[], max?: number) => buildChartSlots(rows, max).map((slot) => `${slot.year}-${slot.month}${slot.row ? '' : '!'}`)

  it('is chronological and keeps empty slots for missing calendar months', () => {
    expect(labels([row(2026, 4), row(2026, 2), row(2026, 1)])).toEqual(['2026-1', '2026-2', '2026-3!', '2026-4'])
  })

  it('crosses year boundaries', () => {
    expect(labels([row(2026, 1), row(2025, 12), row(2025, 11)])).toEqual(['2025-11', '2025-12', '2026-1'])
  })

  it('keeps only the most recent calendar months', () => {
    const rows = Array.from({ length: 15 }, (_, index) => row(2025 + Math.floor((14 - index) / 12), ((14 - index) % 12) + 1))
    const slots = buildChartSlots(rows)
    expect(slots).toHaveLength(12)
    expect(slots[11]).toMatchObject({ year: 2026, month: 3 })
    expect(slots[0]).toMatchObject({ year: 2025, month: 4 })
  })

  it('returns nothing for an empty history', () => {
    expect(buildChartSlots([])).toEqual([])
  })
})
