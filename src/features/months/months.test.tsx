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
    await user.clear(screen.getByLabelText('Monto inicial (ARS)'))
    await user.type(screen.getByLabelText('Monto inicial (ARS)'), '-1000')
    await user.clear(screen.getByLabelText('Importe de Alquiler'))
    await user.type(screen.getByLabelText('Importe de Alquiler'), '900')
    await user.clear(screen.getByLabelText('Vencimiento de Alquiler'))
    await user.click(screen.getByRole('button', { name: 'Crear mes' }))
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
    const dueDate = screen.getByLabelText('Vencimiento de Alquiler')
    await user.clear(screen.getByLabelText('Mes'))
    await user.type(screen.getByLabelText('Mes'), '10')
    expect(dueDate).toHaveValue(`${year}-10-31`)
    await user.clear(screen.getByLabelText('Mes'))
    await user.type(screen.getByLabelText('Mes'), '2')
    expect(dueDate).toHaveValue(`${year}-02-28`)
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
    await waitFor(() => expect(screen.getByText('Deuda pendiente')).toBeVisible())
    await waitFor(() => expect(screen.getByText('Alquiler')).toBeVisible())
    const summary = within(screen.getByRole('region', { name: 'Resumen del mes' }))
    expect(summary.getByText(/^\$\s*750,00$/)).toBeVisible()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Marcar pagada' }))
    await waitFor(() => expect(screen.getByText('Pagada')).toBeVisible())
    expect(summary.getByText(/^\$\s*0,00$/)).toBeVisible()
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
      name: 'finanzas.moneo',
      getFile: vi.fn(async () => new Blob()),
      createWritable: vi.fn(async () => ({
        write: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
      })),
    }
    const fileAccess = makeFileAccess(true)
    vi.mocked(fileAccess.saveAs).mockResolvedValue({ name: 'finanzas.moneo', target })
    const directSession = new VaultSession({ createClient: () => makeClient(operation), fileAccess })
    await directSession.create('test-password')
    renderInVault(directSession, <VaultHomePage />)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Elegir dónde guardar' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /^Guardar$/ })).toBeVisible())
    expect(screen.getByText('Archivo vinculado: finanzas.moneo')).toBeVisible()
    await user.click(screen.getByText('Acciones'))
    const directMenu = screen.getByText('Acciones').closest('details') as HTMLElement
    expect(within(directMenu).getByRole('button', { name: 'Guardar como…' })).toBeVisible()
    expect(within(directMenu).getByRole('button', { name: 'Descargar copia' })).toBeVisible()
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
    await waitFor(() => expect(screen.getByRole('button', { name: 'Descargar copia' })).toBeVisible())
    await userEvent.setup().click(screen.getByText('Acciones'))
    const fallbackMenu = screen.getByText('Acciones').closest('details') as HTMLElement
    expect(within(fallbackMenu).queryByRole('button', { name: 'Guardar como…' })).toBeNull()
    expect(within(fallbackMenu).queryByRole('button', { name: 'Descargar copia' })).toBeNull()
    expect(within(fallbackMenu).getByRole('link', { name: 'Historial' })).toBeVisible()
  })
})
