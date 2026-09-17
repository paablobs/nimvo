import { parseMoneyToCents } from '../../domain/money.ts'

/** Parses the ARS display format while preserving a leading sign. */
export function parseSignedMoneyToCents(value: unknown): number | null {
  if (typeof value !== 'string') return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
  const source = value.trim()
  if (source.length === 0) return null
  const sign = source.startsWith('-') ? -1 : 1
  const unsigned = source.startsWith('-') || source.startsWith('+') ? source.slice(1) : source
  const cents = parseMoneyToCents(unsigned)
  if (cents === null) return null
  return sign * cents
}
