import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import PreferencesMenu from './PreferencesMenu.tsx'
import { I18nProvider, LANGUAGE_STORAGE_KEY, NUMBER_FORMAT_STORAGE_KEY } from '../i18n/i18n.tsx'

describe('PreferencesMenu', () => {
  it('persists language and number format and returns focus on Escape', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><PreferencesMenu /></I18nProvider>)
    const trigger = screen.getByRole('button', { name: 'Preferences' })
    await user.click(trigger)
    await waitFor(() => expect(screen.getByRole('button', { name: 'EN' })).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'ES' }))
    await user.click(screen.getByRole('button', { name: 'Preferencias' }))
    await user.click(screen.getByRole('button', { name: '1.234,56' }))
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es')
    expect(window.localStorage.getItem(NUMBER_FORMAT_STORAGE_KEY)).toBe('es-AR')
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('traps Tab within the open menu', async () => {
    const user = userEvent.setup()
    render(<I18nProvider><PreferencesMenu /></I18nProvider>)
    await user.click(screen.getByRole('button', { name: 'Preferences' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'EN' })).toHaveFocus())
    await user.keyboard('{Shift>}{Tab}{/Shift}')
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveFocus()
  })
})
