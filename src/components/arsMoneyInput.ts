import { formatMoney, parseMoneyToCents, parseSignedMoneyToCents, type MoneyLocale } from '../domain/money.ts'

/** Keeps a money draft editable while rejecting characters and fractions beyond centavos. */
export function sanitizeArsMoneyInput(value: string, allowNegative = false, locale: MoneyLocale = 'es-AR'): string {
  const source = value.replace(/\s/g, '').replace(/[€$]/g, '')
  const negative = allowNegative && source.startsWith('-')
  const body = source.replace(/^[+-]/, '').replace(/[^0-9.,]/g, '')
  if (body === '') return negative ? '-' : ''

  const decimalSeparator = locale === 'en-US' ? '.' : ','
  const lastComma = body.lastIndexOf(',')
  const lastDot = body.lastIndexOf('.')
  const lastSeparator = Math.max(lastComma, lastDot)
  if (lastSeparator >= 0) {
    const trailing = body.slice(lastSeparator + 1)
    const typedSeparator = body[lastSeparator]
    const isSingleSeparator = body.indexOf(typedSeparator) === lastSeparator
    const looksLikeLongFraction = trailing.length >= 3 && body.slice(0, lastSeparator).length >= 3
    if (trailing.length <= 2 || (typedSeparator === decimalSeparator && isSingleSeparator) || (looksLikeLongFraction && isSingleSeparator)) {
      const whole = body.slice(0, lastSeparator).replace(/[.,]/g, '').replace(/[^0-9]/g, '')
      const fraction = trailing.replace(/[^0-9]/g, '').slice(0, 2)
      const outputSeparator = looksLikeLongFraction && typedSeparator !== decimalSeparator ? typedSeparator : decimalSeparator
      return `${negative ? '-' : ''}${whole || '0'}${outputSeparator}${fraction}`
    }
    if (trailing.length === 3 && body.split(typedSeparator).every((part, index) => index === 0 ? part.length <= 3 : part.length === 3)) {
      return `${negative ? '-' : ''}${body.replace(/[.,]/g, '').replace(/[^0-9]/g, '')}`
    }
  }
  return `${negative ? '-' : ''}${body.replace(/[.,]/g, '').replace(/[^0-9]/g, '')}`
}

export function normalizeArsMoneyInput(value: string, allowNegative = false, locale: MoneyLocale = 'es-AR'): string {
  if (value.trim() === '' || value === '-') return value
  const parse = allowNegative ? parseSignedMoneyToCents : parseMoneyToCents
  const alternateLocale: MoneyLocale = locale === 'en-US' ? 'es-AR' : 'en-US'
  const sanitized = sanitizeArsMoneyInput(value, allowNegative, locale)
  const cents = parse(value, locale) ?? parse(value, alternateLocale) ?? parse(sanitized.replace(/[.,]$/, ''), locale) ?? parse(sanitized.replace(/[.,]$/, ''), alternateLocale)
  return cents === null ? value : formatMoney(cents, { symbol: false, locale })
}

export function reformatArsMoneyInput(
  value: string,
  allowNegative: boolean,
  fromLocale: MoneyLocale,
  toLocale: MoneyLocale,
): string {
  if (value.trim() === '' || value === '-') return value
  const parse = allowNegative ? parseSignedMoneyToCents : parseMoneyToCents
  const cents = parse(value, fromLocale)
  return cents === null ? value : formatMoney(cents, { symbol: false, locale: toLocale })
}
