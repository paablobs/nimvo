import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { DomainOperation } from '../../db/worker/protocol.ts'
import type { Debt, Month, RecurringDebtTemplate } from '../../domain/types.ts'
import { VaultProvider } from '../vault/VaultProvider.tsx'
import { VaultSession, type DatabaseClientLike } from '../vault/VaultSession.ts'
import type { VaultFileAccessLike, VaultFileHandle } from '../vault/VaultFileAccess.ts'
import VaultHomePage from '../vault/VaultHomePage.tsx'
import MonthCreationDialog from './MonthCreationDialog.tsx'

const month: Month = { id: 'month-1', year: 2026, month: 9, initialAmountCents: 100000, currency: 'ARS', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }
const template: RecurringDebtTemplate = { id: 'template-1', concept: 'Alquiler', defaultAmountCents: 75000, dueDay: 10, isActive: true, createdAt: month.createdAt, updatedAt: month.updatedAt }
const makeClient = (operation: (value: DomainOperation) => unknown): DatabaseClientLike => ({ open: vi.fn(async () => undefined), export: vi.fn(async () => new Uint8Array()), close: vi.fn(async () => undefined), operation: vi.fn(async (value: DomainOperation) => operation(value)) as DatabaseClientLike['operation'] })
const makeFileAccess = (directFileAccessSupported: boolean): VaultFileAccessLike => ({ directFileAccessSupported, open: vi.fn(async () => null), saveAs: vi.fn(async () => null), write: vi.fn(async () => undefined) })
const renderInVault = (session: VaultSession, children: React.ReactNode) => render(<ChakraProvider value={defaultSystem}><VaultProvider session={session}><MemoryRouter>{children}</MemoryRouter></VaultProvider></ChakraProvider>)

describe('monthly workspace', () => {
  it('sends active templates by default and preserves overrides in atomic create', async () => {
    const calls: DomainOperation[] = []
    const session = new VaultSession({ createClient: () => makeClient((operation) => { calls.push(operation); return { month, debts: [] } }) })
    await session.create('test-password')
    const onCreated = vi.fn(async () => undefined)
    renderInVault(session, <MonthCreationDialog templates={[template, { ...template, id: 'archived', isActive: false }]} onClose={vi.fn()} onCreated={onCreated} />)
    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Amount (ARS)'))
    await user.type(screen.getByLabelText('Amount (ARS)'), '-1000')
    await user.clear(screen.getByLabelText('Amount for Alquiler'))
    await user.type(screen.getByLabelText('Amount for Alquiler'), '900')
    await user.clear(screen.getByLabelText('Due date for Alquiler'))
    await user.click(screen.getByRole('button', { name: 'Create month' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    const operation = calls.find((value) => value.kind === 'months.createWithTemplates')
    expect(operation).toMatchObject({ kind: 'months.createWithTemplates', input: { year: 2026, month: 9, initialAmountCents: -100000 }, templateIds: [{ templateId: 'template-1', amountCents: 90000, dueDate: null }] })
  })

  it('recomputes default due dates when changing period and clamps day 31', async () => {
    const session = new VaultSession({ createClient: () => makeClient(() => ({ month, debts: [] })) })
    await session.create('test-password')
    renderInVault(session, <MonthCreationDialog templates={[{ ...template, dueDay: 31 }]} onClose={vi.fn()} onCreated={vi.fn(async () => undefined)} />)
    const user = userEvent.setup()
    const year = String(new Date().getFullYear())
    const dueDate = screen.getByLabelText('Due date for Alquiler')
    await user.clear(screen.getByLabelText('Month'))
    await user.type(screen.getByLabelText('Month'), '10')
    expect(dueDate).toHaveValue(`${year}-10-31`)
    await user.clear(screen.getByLabelText('Month'))
    await user.type(screen.getByLabelText('Month'), '2')
    expect(dueDate).toHaveValue(`${year}-02-28`)
  })

  it('offers the chronologically previous month income as a fixed option', async () => {
    const previous = { ...month, id: 'month-previous', year: 2026, month: 8, initialAmountCents: 12345 }
    const older = { ...month, id: 'month-older', year: 2025, month: 12, initialAmountCents: 99999 }
    const calls: DomainOperation[] = []
    const session = new VaultSession({ createClient: () => makeClient((operation) => { calls.push(operation); return { month, debts: [] } }) })
    await session.create('test-password')
    renderInVault(session, <MonthCreationDialog existingMonths={[older, previous]} templates={[]} onClose={vi.fn()} onCreated={vi.fn(async () => undefined)} />)
    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Year'))
    await user.type(screen.getByLabelText('Year'), '2026')
    await user.clear(screen.getByLabelText('Month'))
    await user.type(screen.getByLabelText('Month'), '9')
    await user.click(screen.getByLabelText(/Repeat income from previous month/))
    expect(screen.getByLabelText('Amount (ARS)')).toHaveValue('123.45')
    await user.clear(screen.getByLabelText('Month'))
    await user.type(screen.getByLabelText('Month'), '9')
    expect(screen.getByLabelText('Amount (ARS)')).toHaveValue('123.45')
    await user.click(screen.getByRole('button', { name: 'Create month' }))
    const operation = calls.find((value) => value.kind === 'months.createWithTemplates')
    expect(operation).toMatchObject({ input: { initialAmountCents: 12345 } })
  })

  it('does not offer a non-adjacent month as the previous income', async () => {
    const older = { ...month, id: 'month-older', year: 2025, month: 12, initialAmountCents: 99999 }
    const session = new VaultSession({ createClient: () => makeClient(() => ({ month, debts: [] })) })
    await session.create('test-password')
    renderInVault(session, <MonthCreationDialog existingMonths={[older]} templates={[]} onClose={vi.fn()} onCreated={vi.fn(async () => undefined)} />)
    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Year'))
    await user.type(screen.getByLabelText('Year'), '2026')
    await user.clear(screen.getByLabelText('Month'))
    await user.type(screen.getByLabelText('Month'), '9')
    expect(screen.queryByLabelText(/Repeat income from previous month/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Enter another amount manually/)).toBeChecked()
    expect(screen.getByLabelText('Amount (ARS)')).not.toBeDisabled()
    await user.clear(screen.getByLabelText('Month'))
    await user.type(screen.getByLabelText('Month'), '1')
    await user.click(screen.getByLabelText(/Repeat income from previous month/))
    expect(screen.getByLabelText('Amount (ARS)')).toHaveValue('999.99')
  })

  it('switches to manual mode when there is no previous month and preserves that value', async () => {
    const previous = { ...month, id: 'month-previous', year: 2026, month: 8, initialAmountCents: 12345 }
    const older = { ...month, id: 'month-older', year: 2025, month: 11, initialAmountCents: 99999 }
    const session = new VaultSession({ createClient: () => makeClient(() => ({ month, debts: [] })) })
    await session.create('test-password')
    renderInVault(session, <MonthCreationDialog existingMonths={[older, previous]} templates={[]} onClose={vi.fn()} onCreated={vi.fn(async () => undefined)} />)
    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Year'))
    await user.type(screen.getByLabelText('Year'), '2026')
    await user.clear(screen.getByLabelText('Month'))
    await user.type(screen.getByLabelText('Month'), '9')
    await user.click(screen.getByLabelText(/Repeat income from previous month/))
    await user.clear(screen.getByLabelText('Month'))
    await user.type(screen.getByLabelText('Month'), '10')
    expect(screen.queryByLabelText(/Repeat income from previous month/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Enter another amount manually/)).toBeChecked()
    const income = screen.getByLabelText('Amount (ARS)')
    expect(income).not.toBeDisabled()
    await user.clear(income)
    await user.type(income, '777')
    await user.clear(screen.getByLabelText('Month'))
    await user.type(screen.getByLabelText('Month'), '9')
    expect(screen.getByLabelText('Amount (ARS)')).toHaveValue('777.00')
    expect(screen.getByLabelText(/Enter another amount manually/)).toBeChecked()
  })

  it('keeps the dialog open and explains when the month already exists', async () => {
    const operation = vi.fn(() => ({ month, debts: [] }))
    const session = new VaultSession({ createClient: () => makeClient(operation) })
    await session.create('test-password')
    const onClose = vi.fn()
    const onCreated = vi.fn(async () => undefined)
    renderInVault(session, <MonthCreationDialog existingMonths={[month]} templates={[]} onClose={onClose} onCreated={onCreated} />)
    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Year'))
    await user.type(screen.getByLabelText('Year'), String(month.year))
    await user.clear(screen.getByLabelText('Month'))
    await user.type(screen.getByLabelText('Month'), String(month.month))
    await user.click(screen.getByRole('button', { name: 'Create month' }))
    expect(screen.getByRole('alert')).toHaveTextContent('That month already exists.')
    expect(operation).toHaveBeenCalledTimes(1)
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('rejects amounts above 999999999', async () => {
    const operation = vi.fn(() => ({ month, debts: [] }))
    const session = new VaultSession({ createClient: () => makeClient(operation) })
    await session.create('test-password')
    renderInVault(session, <MonthCreationDialog templates={[]} onClose={vi.fn()} onCreated={vi.fn(async () => undefined)} />)
    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Amount (ARS)'))
    await user.type(screen.getByLabelText('Amount (ARS)'), '1000000000')
    await user.click(screen.getByRole('button', { name: 'Create month' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid year, month, and income.')
    expect(operation).toHaveBeenCalledTimes(1)
  })

  it('calculates summary and refreshes it when a debt is paid', async () => {
    let debt: Debt = { id: 'debt-1', monthId: month.id, templateId: null, concept: 'Alquiler', amountCents: 25000, dueDate: null, paidAt: null, createdAt: month.createdAt, updatedAt: month.updatedAt }
    const session = new VaultSession({ createClient: () => makeClient((operation) => {
      if (operation.kind === 'months.list') return [month]
      if (operation.kind === 'templates.list') return []
      if (operation.kind === 'debts.list') return [debt]
      if (operation.kind === 'expenses.list') return []
      if (operation.kind === 'debts.update') { debt = { ...debt, paidAt: operation.input.paidAt ?? null }; return debt }
      return undefined
    }) })
    await session.create('test-password')
    renderInVault(session, <VaultHomePage />)
    await waitFor(() => expect(screen.getByText('Pending fixed expenses')).toBeVisible())
    await waitFor(() => expect(screen.getByText('Alquiler')).toBeVisible())
    const summary = within(screen.getByRole('region', { name: 'Monthly summary' }))
    expect(summary.getByText(/^\$\s*750\.00$/)).toBeVisible()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mark as paid' }))
    await waitFor(() => expect(screen.getByText('Paid')).toBeVisible())
    expect(summary.getByText(/^\$\s*0\.00$/)).toBeVisible()
  })

  it('shows direct file actions only when the browser supports them', async () => {
    const operation = (value: DomainOperation) => {
      if (value.kind === 'months.list') return [month]
      if (value.kind === 'templates.list') return []
      if (value.kind === 'categories.list') return []
      if (value.kind === 'debts.list' || value.kind === 'expenses.list') return []
      return undefined
    }
    const target: VaultFileHandle = {
      name: 'finanzas.nimvo',
      getFile: vi.fn(async () => new Blob()),
      createWritable: vi.fn(async () => ({
        write: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      })),
    }
    const fileAccess = makeFileAccess(true)
    vi.mocked(fileAccess.saveAs).mockResolvedValue({ name: 'finanzas.nimvo', target })
    const directSession = new VaultSession({ createClient: () => makeClient(operation), fileAccess })
    await directSession.create('test-password')
    renderInVault(directSession, <VaultHomePage />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Choose where to save' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Save$/ })).toBeVisible())
    expect(screen.getByText('Linked file: finanzas.nimvo')).toBeVisible()
    await user.click(screen.getByText('Actions'))
    const directMenu = screen.getByText('Actions').closest('details') as HTMLElement
    expect(within(directMenu).getByRole('button', { name: 'Save as…' })).toBeVisible()
    expect(within(directMenu).getByRole('button', { name: 'Download copy' })).toBeVisible()
    await user.click(within(directMenu).getByRole('button', { name: 'Templates' }))
    expect(directMenu).not.toHaveAttribute('open')
    expect(screen.getByRole('dialog', { name: 'Templates' })).toBeVisible()
  })

  it('uses one download action when direct file access is unavailable', async () => {
    const operation = (value: DomainOperation) => {
      if (value.kind === 'months.list') return [month]
      if (value.kind === 'templates.list') return []
      if (value.kind === 'categories.list') return []
      if (value.kind === 'debts.list' || value.kind === 'expenses.list') return []
      return undefined
    }
    const session = new VaultSession({ createClient: () => makeClient(operation), fileAccess: makeFileAccess(false) })
    await session.create('test-password')
    renderInVault(session, <VaultHomePage />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download copy' })).toBeVisible())
    await userEvent.setup().click(screen.getByText('Actions'))
    const fallbackMenu = screen.getByText('Actions').closest('details') as HTMLElement
    expect(within(fallbackMenu).queryByRole('button', { name: 'Save as…' })).toBeNull()
    expect(within(fallbackMenu).queryByRole('button', { name: 'Download copy' })).toBeNull()
    expect(within(fallbackMenu).getByRole('link', { name: 'History' })).toBeVisible()
  })
})
