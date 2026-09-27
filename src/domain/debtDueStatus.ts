import { compareCivilDates, isValidCivilDate } from './dates.ts'
import type { CivilDate } from './types.ts'

export type DebtDueStatus = 'paid' | 'due' | 'soon' | 'normal'

const MILLISECONDS_PER_DAY = 86_400_000

function utcDayNumber(value: CivilDate): number {
  if (!isValidCivilDate(value)) throw new RangeError('Fecha civil inválida')
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getTime() / MILLISECONDS_PER_DAY
}

export function getDebtDueStatus(dueDate: CivilDate | null, paidAt: string | null, today: CivilDate): DebtDueStatus {
  if (paidAt !== null) return 'paid'
  if (dueDate === null) return 'normal'

  if (compareCivilDates(dueDate, today) <= 0) return 'due'

  const daysUntilDue = utcDayNumber(dueDate) - utcDayNumber(today)
  return daysUntilDue <= 3 ? 'soon' : 'normal'
}
