import { describe, expect, it } from 'vitest'
import { getDebtDueStatus } from './debtDueStatus.ts'

describe('getDebtDueStatus', () => {
  it('gives paid debts priority over every due date state', () => {
    expect(getDebtDueStatus(null, '2026-09-27T00:00:00.000Z', '2026-09-27')).toBe('paid')
    expect(getDebtDueStatus('2026-09-20', '2026-09-27T00:00:00.000Z', '2026-09-27')).toBe('paid')
    expect(getDebtDueStatus('2026-10-01', '2026-09-27T00:00:00.000Z', '2026-09-27')).toBe('paid')
  })

  it('uses normal for debts without a due date', () => {
    expect(getDebtDueStatus(null, null, '2026-09-27')).toBe('normal')
  })

  it('marks due and overdue dates as due', () => {
    expect(getDebtDueStatus('2026-09-26', null, '2026-09-27')).toBe('due')
    expect(getDebtDueStatus('2026-09-27', null, '2026-09-27')).toBe('due')
  })

  it('marks one through three calendar days ahead as soon and later dates as normal', () => {
    expect(getDebtDueStatus('2026-09-28', null, '2026-09-27')).toBe('soon')
    expect(getDebtDueStatus('2026-09-29', null, '2026-09-27')).toBe('soon')
    expect(getDebtDueStatus('2026-09-30', null, '2026-09-27')).toBe('soon')
    expect(getDebtDueStatus('2026-10-01', null, '2026-09-27')).toBe('normal')
  })

  it('counts calendar days across month and year boundaries', () => {
    expect(getDebtDueStatus('2026-02-01', null, '2026-01-30')).toBe('soon')
    expect(getDebtDueStatus('2027-01-01', null, '2026-12-30')).toBe('soon')
    expect(getDebtDueStatus('2027-01-02', null, '2026-12-30')).toBe('soon')
    expect(getDebtDueStatus('2027-01-03', null, '2026-12-30')).toBe('normal')
  })

  it('handles leap days in the calendar difference', () => {
    expect(getDebtDueStatus('2028-02-29', null, '2028-02-27')).toBe('soon')
    expect(getDebtDueStatus('2028-03-01', null, '2028-02-27')).toBe('soon')
    expect(getDebtDueStatus('2028-03-02', null, '2028-02-27')).toBe('normal')
  })

  it('rejects invalid civil dates when comparing an unpaid debt', () => {
    expect(() => getDebtDueStatus('2026-02-30', null, '2026-02-27')).toThrow(RangeError)
    expect(() => getDebtDueStatus('2026-02-28', null, '2026-02-30')).toThrow(RangeError)
  })
})
