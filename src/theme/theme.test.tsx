import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { getInitialTheme, LEGACY_THEME_STORAGE_KEY, THEME_STORAGE_KEY, useTheme } from './theme.ts'

function ThemeProbe() {
  const { mode, toggle } = useTheme()
  return (
    <button type="button" onClick={toggle}>
      {mode}
    </button>
  )
}

describe('theme preference', () => {
  it('uses the saved theme before the system preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    })

    expect(getInitialTheme()).toBe('dark')
  })

  it('falls back to prefers-color-scheme when there is no saved preference', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    })

    expect(getInitialTheme()).toBe('dark')
  })

  it('migrates the legacy theme key to Nimvo storage', () => {
    window.localStorage.setItem(LEGACY_THEME_STORAGE_KEY, 'dark')
    expect(getInitialTheme()).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('does not save the system preference on first load', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: true }),
    })

    render(<ThemeProbe />)

    expect(screen.getByRole('button')).toHaveTextContent('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('saves only the manually toggled preference', async () => {
    const user = userEvent.setup()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: false }),
    })

    render(<ThemeProbe />)
    await user.click(screen.getByRole('button'))

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })
})
