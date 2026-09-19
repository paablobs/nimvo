export const CURRENCIES = [
  { code: 'ARS', symbol: '$' },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
] as const

export type CurrencyCode = typeof CURRENCIES[number]['code']
export type CurrencyDefinition = typeof CURRENCIES[number]

export const DEFAULT_CURRENCY: CurrencyCode = 'ARS'

export const isCurrencyCode = (value: unknown): value is CurrencyCode =>
  typeof value === 'string' && CURRENCIES.some((currency) => currency.code === value)

export const currencyDefinition = (currency: CurrencyCode): CurrencyDefinition =>
  CURRENCIES.find((entry) => entry.code === currency) ?? CURRENCIES[0]

export const currencySymbol = (currency: CurrencyCode): string => currencyDefinition(currency).symbol

export const parseCurrencyCode = (value: unknown): CurrencyCode => isCurrencyCode(value) ? value : DEFAULT_CURRENCY
