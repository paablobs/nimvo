/** Whole currency units represented as signed, safe centavos. */
export type Cents = number

/** A civil calendar date. It deliberately has no time-zone semantics. */
export type CivilDate = string

/** An ISO-8601 instant, including its time and offset. */
export type Timestamp = string

/** A month in the local financial calendar. `month` is 1 through 12. */
export interface Month {
  id: string
  year: number
  month: number
  initialAmountCents: Cents
  currency: CurrencyCode
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Category {
  id: string
  name: string
  colorToken: string | null
  isArchived: boolean
  createdAt: Timestamp
}

export interface RecurringDebtTemplate {
  id: string
  concept: string
  defaultAmountCents: Cents | null
  dueDay: number | null
  isActive: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Debt {
  id: string
  monthId: string
  templateId: string | null
  concept: string
  dueDate: CivilDate | null
  amountCents: Cents
  paidAt: Timestamp | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface Expense {
  id: string
  monthId: string
  categoryId: string
  spentOn: CivilDate
  description: string | null
  amountCents: Cents
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface ValidationError {
  valid: false
  error: string
}

export interface ValidationSuccess {
  valid: true
}

export type ValidationResult = ValidationSuccess | ValidationError
import type { CurrencyCode } from './currency.ts'
