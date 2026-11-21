import '@testing-library/jest-dom/vitest'

import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.style.colorScheme = ''
})

// Sessions created without an explicit KDF would run Argon2id with production
// parameters on the test thread. Swap in the same algorithm at the minimum
// allowed cost; the real Worker path is covered by the Playwright suites.
vi.mock('../crypto/kdf.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../crypto/kdf.ts')>()
  const { testKdf } = await import('./testKdf.ts')
  return { ...original, defaultKdf: () => testKdf }
})
