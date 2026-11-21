import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { DomainOperation } from '../../db/worker/protocol.ts'
import { I18nProvider } from '../../i18n/i18n.tsx'
import CreateVaultPage from './CreateVaultPage.tsx'
import PasswordStrength from './PasswordStrength.tsx'
import { loadPasswordScorer } from './passwordStrength.ts'
import { VaultProvider } from './VaultProvider.tsx'
import { VaultSession, type DatabaseClientLike } from './VaultSession.ts'

const client = (): DatabaseClientLike => ({
  open: vi.fn(async () => undefined),
  export: vi.fn(async () => new Uint8Array([1])),
  close: vi.fn(async () => undefined),
  operation: vi.fn(async (_operation: DomainOperation) => undefined) as DatabaseClientLike['operation'],
})

describe('password scoring', () => {
  it('rates common passwords low and long random passphrases high', async () => {
    const score = await loadPasswordScorer()
    expect(score('password1')).toBeLessThanOrEqual(1)
    expect(score('12345678')).toBeLessThanOrEqual(1)
    expect(score('correct-horse-9-staple-violet-tractor')).toBe(4)
  })
})

describe('PasswordStrength', () => {
  it('renders nothing visible for an empty password', () => {
    const { container } = render(<I18nProvider><PasswordStrength password="" /></I18nProvider>)
    expect(container).not.toHaveTextContent('Password strength')
  })

  it('warns about a weak password', async () => {
    render(<I18nProvider><PasswordStrength password="password1" /></I18nProvider>)
    expect(await screen.findByText(/may be easy to guess/, undefined, { timeout: 3000 })).toBeVisible()
    expect(screen.getByText(/Very weak|Weak/)).toBeVisible()
  })

  it('shows no warning for a strong passphrase', async () => {
    render(<I18nProvider><PasswordStrength password="correct-horse-9-staple-violet-tractor" /></I18nProvider>)
    expect(await screen.findByText('Strong', undefined, { timeout: 3000 })).toBeVisible()
    expect(screen.queryByText(/may be easy to guess/)).not.toBeInTheDocument()
  })
})

describe('create vault with a weak password', () => {
  it('warns but still creates the vault', async () => {
    const user = userEvent.setup()
    const session = new VaultSession({ createClient: client })
    render(<I18nProvider><VaultProvider session={session}><MemoryRouter><CreateVaultPage /></MemoryRouter></VaultProvider></I18nProvider>)
    await user.type(screen.getByLabelText('Password', { exact: true }), 'password1')
    await user.type(screen.getByLabelText('Confirm password'), 'password1')
    expect(await screen.findByText(/may be easy to guess/, undefined, { timeout: 3000 })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Create vault' }))
    await waitFor(() => expect(session.getSnapshot().status).toBe('unlocked'))
  })
})
