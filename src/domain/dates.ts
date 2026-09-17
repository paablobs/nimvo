import type { CivilDate } from './types.ts'

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isValidCivilDate(value: unknown): value is CivilDate {
  if (typeof value !== 'string') return false
  const match = CIVIL_DATE.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

export const isCivilDate = isValidCivilDate
export const validateCivilDate = isValidCivilDate

export function parseCivilDate(value: unknown): CivilDate | null {
  return isValidCivilDate(value) ? value : null
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(month) || month < 1 || month > 12) {
    throw new RangeError('Mes civil inválido')
  }
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    return leap ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function compareCivilDates(left: CivilDate, right: CivilDate): -1 | 0 | 1 {
  if (!isValidCivilDate(left) || !isValidCivilDate(right)) throw new RangeError('Fecha civil inválida')
  if (left === right) return 0
  return left < right ? -1 : 1
}

export const compareDates = compareCivilDates

export function adjustDueDayToMonth(dueDay: number, year: number, month: number): number {
  if (!Number.isSafeInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new RangeError('Día de vencimiento inválido')
  }
  return Math.min(dueDay, daysInMonth(year, month))
}

export const adjustDueDayToLastDay = adjustDueDayToMonth

/** Convenience form using the conventional year, month, due-day order. */
export function clampDueDay(year: number, month: number, dueDay: number): number {
  return year <= 31 && month > 31
    ? adjustDueDayToMonth(year, month, dueDay)
    : adjustDueDayToMonth(dueDay, year, month)
}

export function adjustDueDay(year: number, month: number, dueDay: number): number {
  return clampDueDay(year, month, dueDay)
}
