import { formatMoney, parseMoneyToCents, parseSignedMoneyToCents } from '../domain/money.ts'

/** Keeps a money draft editable while rejecting characters and fractions beyond centavos. */
export function sanitizeArsMoneyInput(value: string, allowNegative = false): string {
  const source = value.replace(/\s/g, '').replace(/\$/g, '')
  const negative = allowNegative && source.startsWith('-')
  const body = source.replace(/^[+-]/, '').replace(/[^0-9.,]/g, '')
  if (body === '') return negative ? '-' : ''

  const comma = body.lastIndexOf(',')
  if (comma >= 0) {
    const whole = body.slice(0, comma).replace(/[^0-9]/g, '')
    const fraction = body.slice(comma + 1).replace(/[^0-9]/g, '').slice(0, 2)
    return `${negative ? '-' : ''}${whole || '0'},${fraction}`
  }

  const dots = body.split('.')
  if (dots.length === 1) return `${negative ? '-' : ''}${dots[0]}`
  const last = dots[dots.length - 1]
  // A three-digit final group is the es-AR thousands separator. A longer
  // final group is treated as an overlong decimal and capped at two digits.
  if (dots.length === 2 && last.length > 2 && last.length !== 3) {
    return `${negative ? '-' : ''}${dots[0].replace(/[^0-9]/g, '')}.${last.slice(0, 2)}`
  }
  if (dots.length === 2 && last.length <= 2) {
    return `${negative ? '-' : ''}${dots[0].replace(/[^0-9]/g, '')}.${last}`
  }
  if (last.length <= 2) {
    const whole = dots.slice(0, -1).join('').replace(/[^0-9]/g, '')
    return `${negative ? '-' : ''}${whole}.${last}`
  }
  return `${negative ? '-' : ''}${dots.join('').replace(/[^0-9]/g, '')}`
}

export function normalizeArsMoneyInput(value: string, allowNegative = false): string {
  if (value.trim() === '' || value === '-') return value
  const parse = allowNegative ? parseSignedMoneyToCents : parseMoneyToCents
  const cents = parse(value) ?? parse(sanitizeArsMoneyInput(value, allowNegative).replace(/[.,]$/, ''))
  return cents === null ? value : formatMoney(cents, { symbol: false })
}
