import { isValidCivilDate } from './dates.ts'
import { isSafeCents, isSafeSignedCents } from './money.ts'
import type { Category, Debt, Expense, Month, RecurringDebtTemplate, ValidationResult } from './types.ts'

const ok = (): ValidationResult => ({ valid: true })
const fail = (error: string): ValidationResult => ({ valid: false, error })

export const isValidTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value))

const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const safeInteger = (value: unknown): value is number => Number.isSafeInteger(value)

export function validateMonth(value: Partial<Month> | null | undefined): ValidationResult {
  if (!value || !id(value.id) || !safeInteger(value.year) || value.year < 1 || value.year > 9999 || !safeInteger(value.month) || value.month < 1 || value.month > 12) return fail('Mes inválido')
  if (!isSafeSignedCents(value.initialAmountCents)) return fail('Importe inicial inválido')
  if (typeof value.currency !== 'string' || value.currency.trim() === '') return fail('Moneda inválida')
  if (value.createdAt !== undefined && !isValidTimestamp(value.createdAt)) return fail('Marca temporal inválida')
  if (value.updatedAt !== undefined && !isValidTimestamp(value.updatedAt)) return fail('Marca temporal inválida')
  return ok()
}

export function validateCategory(value: Partial<Category> | null | undefined): ValidationResult {
  if (!value || !id(value.id) || typeof value.name !== 'string' || value.name.trim() === '' || (value.colorToken !== null && value.colorToken !== undefined && typeof value.colorToken !== 'string')) return fail('Categoría inválida')
  if (typeof value.isArchived !== 'boolean') return fail('Estado de categoría inválido')
  if (value.createdAt !== undefined && !isValidTimestamp(value.createdAt)) return fail('Marca temporal inválida')
  return ok()
}

export function validateRecurringDebtTemplate(value: Partial<RecurringDebtTemplate> | null | undefined): ValidationResult {
  if (!value || !id(value.id) || typeof value.concept !== 'string' || value.concept.trim() === '') return fail('Plantilla inválida')
  if (value.defaultAmountCents !== null && !isSafeCents(value.defaultAmountCents)) return fail('Importe inválido')
  if (value.dueDay !== null && (!safeInteger(value.dueDay) || value.dueDay < 1 || value.dueDay > 31)) return fail('Día inválido')
  if (typeof value.isActive !== 'boolean') return fail('Estado de plantilla inválido')
  if (value.createdAt !== undefined && !isValidTimestamp(value.createdAt)) return fail('Marca temporal inválida')
  if (value.updatedAt !== undefined && !isValidTimestamp(value.updatedAt)) return fail('Marca temporal inválida')
  return ok()
}

export function validateDebt(value: Partial<Debt> | null | undefined): ValidationResult {
  if (!value || !id(value.id) || !id(value.monthId) || typeof value.concept !== 'string' || value.concept.trim() === '' || !isSafeCents(value.amountCents, { allowZero: false })) return fail('Deuda inválida')
  if (value.templateId !== null && value.templateId !== undefined && !id(value.templateId)) return fail('Plantilla inválida')
  if (value.dueDate !== null && value.dueDate !== undefined && !isValidCivilDate(value.dueDate)) return fail('Fecha de vencimiento inválida')
  if (value.paidAt !== null && value.paidAt !== undefined && !isValidTimestamp(value.paidAt)) return fail('Marca temporal inválida')
  return ok()
}

export function validateExpense(value: Partial<Expense> | null | undefined): ValidationResult {
  if (!value || !id(value.id) || !id(value.monthId) || !id(value.categoryId) || !isValidCivilDate(value.spentOn) || !isSafeCents(value.amountCents, { allowZero: false })) return fail('Gasto inválido')
  if (value.description !== null && value.description !== undefined && typeof value.description !== 'string') return fail('Descripción inválida')
  return ok()
}

export const validateRecurringDebt = validateRecurringDebtTemplate
