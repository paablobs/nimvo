import type { Cents } from './types.ts'

const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER
export function isSafeCents(value: unknown, options: { allowZero?: boolean } = {}): value is Cents {
  const allowZero = options.allowZero ?? true
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    (allowZero ? value >= 0 : value > 0)
  )
}

export function isSafeSignedCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

export const isValidCents = isSafeCents

export function validateMoneyCents(
  value: unknown,
  options: { allowZero?: boolean; nullable?: boolean } = {},
): boolean {
  if (value === null && options.nullable === true) return true
  return isSafeCents(value, options)
}

/**
 * Parses an ARS display value into centavos without using floating point
 * arithmetic. A number is accepted only when it is already an integer count
 * of centavos; decimal numbers are deliberately rejected.
 */
function parseMoneyValue(value: unknown, allowNegative: boolean): Cents | null {
  if (typeof value === 'number') return (allowNegative ? isSafeSignedCents(value) : isSafeCents(value)) ? value : null
  if (typeof value !== 'string') return null

  let source = value.trim()
  if (source.length === 0) return null
  let sign = 1n
  if (source.startsWith('-') || source.startsWith('+')) {
    if (!allowNegative) return null
    sign = source.startsWith('-') ? -1n : 1n
    source = source.slice(1)
  }
  source = source.replace(/^\$\s*/, '')
  source = source.replace(/\s/g, '')
  if (!/^[0-9.,]+$/.test(source)) return null

  const comma = source.lastIndexOf(',')
  const dot = source.lastIndexOf('.')
  let whole = source
  let fraction = ''

  if (comma >= 0) {
    whole = source.slice(0, comma)
    fraction = source.slice(comma + 1)
    if (fraction.length > 2 || fraction.length === 0 || !/^\d+$/.test(fraction)) return null
    if (source.slice(0, comma).includes(',')) return null
    if (!/^\d+$/.test(whole) && !/^\d{1,3}(?:\.\d{3})+$/.test(whole)) return null
    whole = whole.replace(/\./g, '')
  } else if (dot >= 0) {
    const pieces = source.split('.')
    const last = pieces[pieces.length - 1]
    if (pieces.length === 2 && last.length > 0 && last.length < 3 && /^\d+$/.test(pieces[0])) {
      whole = pieces[0]
      fraction = last
    } else {
      if (!/^\d{1,3}(?:\.\d{3})+$/.test(source)) return null
      whole = source.replace(/\./g, '')
    }
  }

  if (whole === '') whole = '0'
  if (!/^\d+$/.test(whole) || (fraction !== '' && !/^\d{1,2}$/.test(fraction))) return null
  const centsText = `${whole}${fraction.padEnd(2, '0')}`

  try {
    const cents = BigInt(centsText)
    const signedCents = sign * cents
    if (signedCents > BigInt(MAX_SAFE_CENTS) || signedCents < -BigInt(MAX_SAFE_CENTS)) return null
    return Number(signedCents)
  } catch {
    return null
  }
}

export function parseMoneyToCents(value: unknown): Cents | null {
  return parseMoneyValue(value, false)
}

/** Parses a signed ARS display value, including negative amounts, to centavos. */
export function parseSignedMoneyToCents(value: unknown): Cents | null {
  return parseMoneyValue(value, true)
}

/** Alias with the shorter name used by callers that already know the currency. */
export const parseMoney = parseMoneyToCents
export const parseArsToCents = parseMoneyToCents
export const parseCents = parseMoneyToCents

function groupThousands(value: string): string {
  let grouped = ''
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0 && (value.length - index) % 3 === 0) grouped += '.'
    grouped += value[index]
  }
  return grouped
}

/** Formats centavos as an ARS value using the es-AR separators. */
export function formatMoney(cents: Cents, options: { symbol?: boolean } = {}): string {
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents)) {
    throw new RangeError('El importe debe ser un entero seguro en centavos')
  }
  const sign = cents < 0 ? '-' : ''
  const text = String(Math.abs(cents)).padStart(3, '0')
  const whole = text.slice(0, -2)
  const fraction = text.slice(-2)
  const value = `${sign}${groupThousands(whole)},${fraction}`
  return options.symbol === false ? value : `${sign}$\u00a0${groupThousands(whole)},${fraction}`
}

export const formatARS = formatMoney
export const formatArs = formatMoney
export const formatCents = formatMoney

/** Adds safe cent amounts and rejects overflow instead of losing precision. */
export function addCents(left: Cents, right: Cents): Cents {
  if (!isSafeSignedCents(left) || !isSafeSignedCents(right) || left > MAX_SAFE_CENTS - right || left < -MAX_SAFE_CENTS - right) {
    throw new RangeError('El resultado excede el rango seguro de centavos')
  }
  return left + right
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0
  for (const value of values) total = addCents(total, value)
  return total
}
