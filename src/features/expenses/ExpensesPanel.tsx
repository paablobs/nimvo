import { Button, Input } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { z } from 'zod'
import AccessibleDialog from '../../components/AccessibleDialog.tsx'
import { isValidCivilDate } from '../../domain/dates.ts'
import type { Category, Expense } from '../../domain/types.ts'
import { formatMoney, parseMoneyToCents, sumCents } from '../../domain/money.ts'
import { useVaultSession } from '../vault/useVaultSession.ts'

const expenseSchema = z.object({
  spentOn: z.string().refine(isValidCivilDate, 'La fecha no es válida.'),
  categoryId: z.string().trim().min(1, 'Elegí una categoría.'),
  description: z.string().optional(),
})

const categorySchema = z.object({ name: z.string().trim().min(1, 'Escribí un nombre.') })

type Draft = { spentOn: string; categoryId: string; amount: string; description: string }

interface Props {
  monthId: string
  year: number
  month: number
  expenses: Expense[]
  categories: Category[]
  onRefresh: () => Promise<void>
  onCategoriesRefresh: () => Promise<void>
}

const dateForMonth = (year: number, month: number): string => {
  const today = new Date()
  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth() + 1
  if (todayYear === year && todayMonth === month) {
    return `${todayYear.toString().padStart(4, '0')}-${todayMonth.toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`
  }
  if (todayYear < year || (todayYear === year && todayMonth < month)) return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`
}

const sortExpenses = (expenses: Expense[]): Expense[] => [...expenses].sort((left, right) => right.spentOn.localeCompare(left.spentOn) || right.id.localeCompare(left.id))

export default function ExpensesPanel({ monthId, year, month, expenses, categories, onRefresh, onCategoriesRefresh }: Props) {
  const vault = useVaultSession()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const activeCategories = categories.filter((category) => !category.isArchived)
  const editCategory = draft ? categoryById.get(draft.categoryId) : undefined
  const categoryOptions = editCategory && editCategory.isArchived ? [editCategory, ...activeCategories] : activeCategories
  const total = useMemo(() => sumCents(expenses.map((expense) => expense.amountCents)), [expenses])
  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const expense of expenses) totals.set(expense.categoryId, sumCents([totals.get(expense.categoryId) ?? 0, expense.amountCents]))
    return totals
  }, [expenses])

  function startCreate() {
    setEditingId(null)
    setDraft({ spentOn: dateForMonth(year, month), categoryId: activeCategories[0]?.id ?? '', amount: '', description: '' })
    setNewCategory(false)
    setCategoryName('')
    setError('')
  }

  function startEdit(expense: Expense) {
    setEditingId(expense.id)
    setDraft({ spentOn: expense.spentOn, categoryId: expense.categoryId, amount: formatMoney(expense.amountCents, { symbol: false }), description: expense.description ?? '' })
    setNewCategory(false)
    setError('')
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    const parsed = expenseSchema.safeParse(draft)
    const amount = parseMoneyToCents(draft.amount)
    if (!parsed.success || amount === null || amount <= 0) {
      setError(parsed.success ? 'El importe debe ser mayor que cero.' : parsed.error.issues[0]?.message ?? 'Revisá los datos.')
      return
    }
    setBusy(true)
    try {
      const input = { categoryId: draft.categoryId, spentOn: draft.spentOn, description: draft.description.trim() || null, amountCents: amount }
      if (editingId) await vault.operation({ kind: 'expenses.update', id: editingId, input })
      else await vault.operation({ kind: 'expenses.create', input: { monthId, ...input } })
      setDraft(null)
      await onRefresh()
    } catch { setError('No se pudo guardar el gasto.') } finally { setBusy(false) }
  }

  async function createCategory() {
    const parsed = categorySchema.safeParse({ name: categoryName })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Revisá el nombre.'); return }
    setBusy(true)
    try {
      const category = await vault.operation<Category>({ kind: 'categories.create', input: { name: parsed.data.name, colorToken: null, isArchived: false } })
      await onCategoriesRefresh()
      setDraft((current) => current ? { ...current, categoryId: category.id } : current)
      setCategoryName('')
      setNewCategory(false)
      setError('')
    } catch { setError('No se pudo crear la categoría.') } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleteId) return
    setBusy(true)
    try { await vault.operation({ kind: 'expenses.delete', id: deleteId }); setDeleteId(null); await onRefresh() } catch { setError('No se pudo eliminar el gasto.') } finally { setBusy(false) }
  }

  return <section className="panel expenses-panel" aria-labelledby="expenses-title">
    <div className="section-heading"><div><p className="eyebrow">Desembolsos</p><h2 id="expenses-title">Gastos del mes</h2></div><Button className="button button-secondary" type="button" onClick={startCreate}>Nuevo gasto</Button></div>
    {draft && <form className="inline-form expense-form" onSubmit={submit} noValidate>
      <label htmlFor="expense-date">Fecha <Input id="expense-date" data-dialog-autofocus type="date" value={draft.spentOn} onChange={(event) => setDraft({ ...draft, spentOn: event.target.value })} /></label>
      <label htmlFor="expense-category">Categoría <select id="expense-category" value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="" disabled>Elegí una categoría</option>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isArchived ? ' (archivada)' : ''}</option>)}</select></label>
      <Button className="button button-small category-inline-trigger" type="button" onClick={() => setNewCategory((current) => !current)} disabled={busy}>{newCategory ? 'Cancelar categoría' : 'Nueva categoría'}</Button>
      {newCategory && <div className="inline-category-form"><label htmlFor="expense-new-category">Nombre de categoría <Input id="expense-new-category" autoFocus value={categoryName} onChange={(event) => setCategoryName(event.target.value)} /></label><Button className="button button-small button-primary" type="button" onClick={createCategory} loading={busy} disabled={busy}>Crear y usar</Button></div>}
      <label htmlFor="expense-amount">Monto (ARS) <Input id="expense-amount" inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
      <label htmlFor="expense-description">Descripción (opcional) <Input id="expense-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      <div className="form-actions"><Button className="button button-primary" type="submit" loading={busy} disabled={busy}>Guardar gasto</Button><Button className="button button-secondary" type="button" onClick={() => setDraft(null)} disabled={busy}>Cancelar</Button></div>
    </form>}
    {error && <p className="form-message error" role="alert">{error}</p>}
    {expenses.length === 0 ? <p className="empty-note">Todavía no hay gastos en este mes.</p> : <div className="table-scroll"><table className="data-table"><caption className="sr-only">Gastos del mes</caption><thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th className="amount-cell">Monto</th><th>Acciones</th></tr></thead><tbody>{sortExpenses(expenses).map((expense) => <tr key={expense.id}><td>{expense.spentOn}</td><td>{categoryById.get(expense.categoryId)?.name ?? 'Categoría archivada'}</td><td>{expense.description ?? 'Sin descripción'}</td><td className="amount-cell">{formatMoney(expense.amountCents)}</td><td className="row-actions"><Button className="button button-small" type="button" onClick={() => startEdit(expense)} disabled={busy}>Editar</Button><Button className="button button-small button-danger" type="button" onClick={() => setDeleteId(expense.id)} disabled={busy}>Eliminar</Button></td></tr>)}</tbody></table></div>}
    <aside className="expense-summary" aria-label="Resumen por categoría"><div className="section-heading"><h3>Resumen por categoría</h3><strong>{formatMoney(total)}</strong></div>{categoryTotals.size === 0 ? <p className="empty-note">Sin gastos para resumir.</p> : <ul>{Array.from(categoryTotals.entries()).map(([categoryId, amount]) => <li key={categoryId}><span>{categoryById.get(categoryId)?.name ?? 'Categoría archivada'}</span><strong>{formatMoney(amount)}</strong></li>)}</ul>}</aside>
    {deleteId && <AccessibleDialog titleId="delete-expense-title" onClose={() => setDeleteId(null)}><div className="confirm-box"><strong id="delete-expense-title">¿Eliminar este gasto?</strong><p>La acción no se puede deshacer.</p><div className="form-actions"><Button className="button button-danger" data-dialog-autofocus type="button" onClick={remove} loading={busy}>Eliminar</Button><Button className="button button-secondary" type="button" onClick={() => setDeleteId(null)} disabled={busy}>Cancelar</Button></div></div></AccessibleDialog>}
  </section>
}
