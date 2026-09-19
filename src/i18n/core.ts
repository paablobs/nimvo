import type { Locale, MoneyLocale } from './types.ts'

export const LANGUAGE_STORAGE_KEY = 'nimvo-language'
export const NUMBER_FORMAT_STORAGE_KEY = 'nimvo-number-format'

export function getStoredLocale(): Locale {
  try { return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'es' ? 'es' : 'en' } catch { return 'en' }
}

export function getMoneyLocale(locale: Locale): MoneyLocale { return locale === 'es' ? 'es-AR' : 'en-US' }

export function moneyHelpForFormat(locale: Locale, numberFormat: MoneyLocale): string {
  if (locale === 'es') {
    return numberFormat === 'en-US'
      ? 'Podés usar 125000.00 o 125,000.00. Se guardan hasta dos decimales.'
      : 'Podés usar 125000,00 o 125.000,00. Se guardan hasta dos decimales.'
  }
  return numberFormat === 'en-US'
    ? 'You can use 125000.00 or 125,000.00. Up to two decimals are stored.'
    : 'You can use 125000,00 or 125.000,00. Up to two decimals are stored.'
}
