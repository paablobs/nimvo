import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DomainOperation } from '../../db/worker/protocol.ts'
import type { Debt } from '../../domain/types.ts'
import { I18nProvider } from '../../i18n/i18n.tsx'
import { VaultProvider } from '../vault/VaultProvider.tsx'
import { VaultSession, type DatabaseClientLike } from '../vault/VaultSession.ts'
import DebtsTable from './DebtsTable.tsx'

const stamp = '2026-01-01T00:00:00.000Z'

const makeDebt = (overrides: Partial<Debt>): Debt => ({
  id: 'debt-default',
  monthId: 'month-1',
  templateId: null,
  concept: 'Default debt',
  dueDate: null,
  amountCents: 10000,
  paidAt: null,
  createdAt: stamp,
  updatedAt: stamp,
  ...overrides,
})

const rowFor = (concept: string): HTMLTableRowElement => {
  const row = screen.getAllByRole('row').find((candidate) => candidate.querySelector('td:nth-child(2)')?.textContent === concept)
  expect(row).not.toBeNull()
  return row as HTMLTableRowElement
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('DebtsTable', () => {
  it('shows due-date priority and translated status labels', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 15, 12))

    const debts: Debt[] = [
      makeDebt({ id: 'overdue', concept: 'Past due', dueDate: '2026-09-14' }),
      makeDebt({ id: 'today', concept: 'Due today', dueDate: '2026-09-15' }),
      makeDebt({ id: 'soon', concept: 'Due soon', dueDate: '2026-09-18' }),
      makeDebt({ id: 'later', concept: 'Due later', dueDate: '2026-09-20' }),
      makeDebt({ id: 'paid', concept: 'Already paid', dueDate: '2026-09-10', paidAt: stamp }),
      makeDebt({ id: 'no-date', concept: 'Fill later', amountCents: null }),
    ]
    const client: DatabaseClientLike = {
      open: vi.fn(async () => undefined),
      export: vi.fn(async () => new Uint8Array()),
      close: vi.fn(async () => undefined),
      operation: vi.fn(async (operation: DomainOperation) => operation.kind === 'vault.getCurrency' ? 'ARS' : undefined) as DatabaseClientLike['operation'],
    }
    const session = new VaultSession({ createClient: () => client })
    await session.create('test-password')

    render(
      <ChakraProvider value={defaultSystem}>
        <I18nProvider>
          <VaultProvider session={session}>
            <DebtsTable monthId="month-1" debts={debts} onRefresh={async () => undefined} />
          </VaultProvider>
        </I18nProvider>
      </ChakraProvider>,
    )

    const overdue = rowFor('Past due')
    expect(overdue).toHaveClass('debt-row--due')
    expect(within(overdue).getByText('Overdue', { selector: 'span.status' })).toBeVisible()

    const today = rowFor('Due today')
    expect(today).toHaveClass('debt-row--due')
    expect(within(today).getByText('Due today', { selector: 'span.status' })).toBeVisible()

    const soon = rowFor('Due soon')
    expect(soon).toHaveClass('debt-row--soon')
    expect(within(soon).getByText('Due soon', { selector: 'span.status' })).toBeVisible()

    const later = rowFor('Due later')
    expect(later).toHaveClass('debt-row--normal')
    expect(within(later).getByText('Pending', { selector: 'span.status' })).toBeVisible()

    const paid = rowFor('Already paid')
    expect(paid).toHaveClass('debt-row--paid')
    expect(within(paid).getByText('Paid', { selector: 'span.status' })).toBeVisible()

    const noDate = rowFor('Fill later')
    expect(noDate).toHaveClass('debt-row--normal')
    expect(within(noDate).getByText('No date')).toBeVisible()
    expect(within(noDate).getByText('Pending', { selector: 'span.status' })).toBeVisible()

    expect(within(overdue).getByRole('button', { name: 'Mark as paid' })).toBeEnabled()
    expect(within(paid).getByRole('button', { name: 'Mark as pending' })).toBeEnabled()
    expect(within(noDate).getByRole('button', { name: 'Mark as paid' })).toBeDisabled()
  })
})
