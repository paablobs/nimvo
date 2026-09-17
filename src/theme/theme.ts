import { useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'nimvo-theme'
export const LEGACY_THEME_STORAGE_KEY = 'moneo-theme'

function readStoredTheme(): ThemeMode | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
    const legacy = window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY)
    if (legacy === 'light' || legacy === 'dark') {
      window.localStorage.setItem(THEME_STORAGE_KEY, legacy)
      return legacy
    }
    return null
  } catch {
    return null
  }
}

export function getInitialTheme(): ThemeMode {
  const storedTheme = readStoredTheme()
  if (storedTheme) return storedTheme

  return getSystemTheme()
}

function getSystemTheme(): ThemeMode {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(getInitialTheme)
  const [hasManualPreference, setHasManualPreference] = useState(
    () => readStoredTheme() !== null,
  )

  useEffect(() => {
    document.documentElement.dataset.theme = mode
    document.documentElement.style.colorScheme = mode
  }, [mode])

  useEffect(() => {
    if (hasManualPreference) return

    const mediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mediaQuery) return

    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      setMode(event.matches ? 'dark' : 'light')
    }
    mediaQuery.addEventListener?.('change', handleSystemThemeChange)

    return () => mediaQuery.removeEventListener?.('change', handleSystemThemeChange)
  }, [hasManualPreference])

  function toggle() {
    const nextMode = mode === 'light' ? 'dark' : 'light'
    setMode(nextMode)
    setHasManualPreference(true)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextMode)
    } catch {
      // Theme preference is optional when storage is unavailable.
    }
  }

  return {
    mode,
    toggle,
  }
}
