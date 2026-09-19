import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider, NUMBER_FORMAT_STORAGE_KEY } from './i18n.tsx'
import { useI18n } from './useI18n.ts'

function Probe() {
  const { locale, numberFormat, setLocale, setNumberFormat, t } = useI18n()
  return <div><span>{locale}</span><span>{numberFormat}</span><span>{t('landingTitle')}</span><button onClick={() => setLocale('es')}>es</button><button onClick={() => setNumberFormat('es-AR')}>format</button></div>
}

describe('i18n preferences', () => {
  beforeEach(() => window.localStorage.clear())

  it('defaults to English and follows the language for number format', () => {
    render(<I18nProvider><Probe /></I18nProvider>)
    expect(screen.getByText('en')).toBeInTheDocument()
    expect(screen.getByText('en-US')).toBeInTheDocument()
    expect(screen.getByText('Your money, on a clear sheet.')).toBeInTheDocument()
  })

  it('persists an explicit number format independently from language', async () => {
    render(<I18nProvider><Probe /></I18nProvider>)
    screen.getByRole('button', { name: 'format' }).click()
    screen.getByRole('button', { name: 'es' }).click()
    await waitFor(() => expect(screen.getByText('es-AR')).toBeInTheDocument())
    expect(window.localStorage.getItem(NUMBER_FORMAT_STORAGE_KEY)).toBe('es-AR')
    expect(screen.getByText('Tu dinero, en una hoja clara.')).toBeInTheDocument()
  })
})
