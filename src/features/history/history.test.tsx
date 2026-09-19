import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { MonthlyHistoryRow } from '../../domain/history.ts'
import type { DomainOperation } from '../../db/worker/protocol.ts'
import { VaultProvider } from '../vault/VaultProvider.tsx'
import { VaultSession, type DatabaseClientLike } from '../vault/VaultSession.ts'
import HistoryPage from './HistoryPage.tsx'

const historyRows = [
  {
    monthId: 'month-2', year: 2026, month: 9, currency: 'ARS', initialAmountCents: 200_000,
    debtTotal: 80_000, debtPending: 20_000, dailyExpenses: 30_000,
    balance: 90_000,
    categoryBreakdown: [{ categoryId: 'archived', name: 'Comida vieja', amountCents: 30_000, isArchived: true }],
  },
  {
    monthId: 'month-1', year: 2026, month: 8, currency: 'ARS', initialAmountCents: -10_000,
    debtTotal: 0, debtPending: 0, dailyExpenses: 1_000,
    balance: -11_000, categoryBreakdown: [],
  },
] satisfies MonthlyHistoryRow[]

const clientFor = (operation: (value: DomainOperation) => unknown): DatabaseClientLike => ({
  open: vi.fn(async () => undefined),
  export: vi.fn(async () => new Uint8Array()),
  close: vi.fn(async () => undefined),
  operation: vi.fn(async (value: DomainOperation) => operation(value)) as DatabaseClientLike['operation'],
})

function renderHistory(session: VaultSession) {
  return render(<ChakraProvider value={defaultSystem}><VaultProvider session={session}><MemoryRouter initialEntries={['/boveda/historial']}><HistoryPage /></MemoryRouter></VaultProvider></ChakraProvider>)
}

describe('monthly history', () => {
  it('offers opening the vault while locked', () => {
    const session = new VaultSession({ createClient: () => clientFor(() => undefined) })
    renderHistory(session)
    expect(screen.getByRole('heading', { name: 'Open a file to continue.' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open file' })).toBeVisible()
  })

  it('loads rows in backend order and expands archived category details', async () => {
    const calls: DomainOperation[] = []
    const session = new VaultSession({ createClient: () => clientFor((operation) => {
      calls.push(operation)
      return operation.kind === 'history.list' ? historyRows : undefined
    }) })
    await session.create('test-password')
    renderHistory(session)

    const table = await screen.findByRole('table', { name: 'Monthly history' })
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('September 2026')
    expect(rows[2]).toHaveTextContent('August 2026')
    expect(within(rows[1]).getByRole('link', { name: 'Back to month' })).toHaveAttribute('href', '/boveda?month=month-2')
    expect(table).toHaveTextContent('-$ 100.00')
    expect(calls).toContainEqual({ kind: 'history.list' })

    const expand = within(rows[1]).getByRole('button', { name: /breakdown/ })
    await userEvent.setup().click(expand)
    expect(screen.getByRole('table', { name: 'Category September 2026' })).toHaveTextContent('Comida vieja')
    expect(screen.getByText('Archived')).toBeVisible()
    expect(within(rows[1]).getByRole('button', { name: /breakdown/ })).toHaveAttribute('aria-expanded', 'true')
  })

  it('does not present an empty state when history loading fails', async () => {
    const session = new VaultSession({ createClient: () => clientFor((operation) => {
      if (operation.kind === 'history.list') throw new Error('offline')
      return undefined
    }) })
    await session.create('test-password')
    renderHistory(session)
    expect(await screen.findByRole('alert')).toHaveTextContent('The history could not be loaded.')
    expect(screen.queryByRole('heading', { name: 'There are no months yet' })).not.toBeInTheDocument()
  })
})
