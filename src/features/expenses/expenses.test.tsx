import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Category, Expense } from '../../domain/types.ts'
import type { DomainOperation } from '../../db/worker/protocol.ts'
import CategoriesPanel from './CategoriesPanel.tsx'
import ExpensesPanel from './ExpensesPanel.tsx'
import { VaultProvider } from '../vault/VaultProvider.tsx'
import { VaultSession, type DatabaseClientLike } from '../vault/VaultSession.ts'

const stamp = '2026-01-01T00:00:00.000Z'
const active: Category = { id: 'cat-active', name: 'Casa', colorToken: null, isArchived: false, createdAt: stamp }
const archived: Category = { id: 'cat-archived', name: 'Viajes', colorToken: null, isArchived: true, createdAt: stamp }

function renderWorkspace(initialCategories: Category[], initialExpenses: Expense[] = []) {
  let categories = initialCategories
  let expenses = initialExpenses
  const client: DatabaseClientLike = {
    open: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    export: vi.fn(async () => new Uint8Array()),
    operation: vi.fn(async (operation: DomainOperation) => {
      if (operation.kind === 'categories.create') {
        const category: Category = { id: 'cat-new', name: operation.input.name, colorToken: null, isArchived: false, createdAt: stamp }
        categories = [...categories, category]
        return category
      }
      if (operation.kind === 'expenses.create') {
        const expense: Expense = { id: 'expense-new', ...operation.input, description: operation.input.description ?? null, createdAt: stamp, updatedAt: stamp }
        expenses = [...expenses, expense]
        return expense
      }
      if (operation.kind === 'expenses.update') {
        const current = expenses.find((expense) => expense.id === operation.id)
        if (!current) throw new Error('not found')
        const updated = { ...current, ...operation.input, updatedAt: stamp }
        expenses = expenses.map((expense) => expense.id === operation.id ? updated : expense)
        return updated
      }
      if (operation.kind === 'expenses.delete') { expenses = expenses.filter((expense) => expense.id !== operation.id); return undefined }
      if (operation.kind === 'categories.archive') { categories = categories.map((category) => category.id === operation.id ? { ...category, isArchived: true } : category); return categories.find((category) => category.id === operation.id) }
      if (operation.kind === 'categories.restore') { categories = categories.map((category) => category.id === operation.id ? { ...category, isArchived: false } : category); return categories.find((category) => category.id === operation.id) }
      if (operation.kind === 'categories.update') { categories = categories.map((category) => category.id === operation.id ? { ...category, ...operation.input } : category); return categories.find((category) => category.id === operation.id) }
      return undefined
    }) as DatabaseClientLike['operation'],
  }
  const session = new VaultSession({ createClient: () => client })
  function Harness() {
    const [viewCategories, setViewCategories] = useState(categories)
    const [viewExpenses, setViewExpenses] = useState(expenses)
    return <ChakraProvider value={defaultSystem}><VaultProvider session={session}><ExpensesPanel monthId="month-1" year={2026} month={1} categories={viewCategories} expenses={viewExpenses} onRefresh={async () => setViewExpenses([...expenses])} onCategoriesRefresh={async () => setViewCategories([...categories])} /><CategoriesPanel categories={viewCategories} onRefresh={async () => setViewCategories([...categories])} onClose={vi.fn()} /></VaultProvider></ChakraProvider>
  }
  return { session, render: () => render(<Harness />) }
}

describe('expenses UI', () => {
  it('creates an inline category without losing the expense draft', async () => {
    const user = userEvent.setup()
    const workspace = renderWorkspace([active])
    await workspace.session.create('test-password')
    workspace.render()
    await user.click(screen.getByRole('button', { name: 'Nuevo gasto' }))
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Supermercado')
    await user.click(screen.getByRole('button', { name: 'Nueva categoría' }))
    await user.type(screen.getByLabelText('Nombre de categoría'), 'Comida')
    await user.click(screen.getByRole('button', { name: 'Crear y usar' }))
    await user.type(screen.getByLabelText('Monto (ARS)'), '100')
    expect(screen.getByLabelText('Descripción (opcional)')).toHaveValue('Supermercado')
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    expect(await screen.findByText('Supermercado')).toBeVisible()
    expect(screen.getAllByText('Comida').length).toBeGreaterThan(0)
  })

  it('keeps archived category names in history and excludes them from a new expense', async () => {
    const user = userEvent.setup()
    const expense: Expense = { id: 'expense-old', monthId: 'month-1', categoryId: archived.id, spentOn: '2026-01-03', description: 'Hotel', amountCents: 10000, createdAt: stamp, updatedAt: stamp }
    const workspace = renderWorkspace([active, archived], [expense])
    await workspace.session.create('test-password')
    workspace.render()
    expect(screen.getAllByText('Viajes').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Nuevo gasto' }))
    expect(within(screen.getByLabelText('Categoría')).queryByText('Viajes')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Archivar' }))
  })

  it('updates and deletes a gasto in the category summary', async () => {
    const user = userEvent.setup()
    const expense: Expense = { id: 'expense-old', monthId: 'month-1', categoryId: active.id, spentOn: '2026-01-03', description: 'Hotel', amountCents: 10000, createdAt: stamp, updatedAt: stamp }
    const workspace = renderWorkspace([active], [expense])
    await workspace.session.create('test-password')
    workspace.render()
    const summary = screen.getByRole('complementary', { name: 'Resumen por categoría' })
    expect(summary).toHaveTextContent('100,00')
    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.clear(screen.getByLabelText('Monto (ARS)'))
    await user.type(screen.getByLabelText('Monto (ARS)'), '150')
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }))
    expect(await screen.findByRole('complementary', { name: 'Resumen por categoría' })).toHaveTextContent('150,00')
    await user.click(within(screen.getByRole('table', { name: 'Gastos del mes' })).getByRole('button', { name: 'Eliminar' }))
    await user.click(within(screen.getByRole('dialog', { name: '¿Eliminar este gasto?' })).getByRole('button', { name: 'Eliminar' }))
    expect(await screen.findByText('Sin gastos para resumir.')).toBeVisible()
  })
})
