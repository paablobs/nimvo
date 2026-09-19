import { Button, Input } from '@chakra-ui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import AccessibleDialog from '../../components/AccessibleDialog.tsx'
import { isValidCivilDate } from '../../domain/dates.ts'
import type { Category, Expense } from '../../domain/types.ts'
import { formatMoney, parseMoneyToCents, sumCents } from '../../domain/money.ts'
import { useVaultSession } from '../vault/useVaultSession.ts'
import ArsMoneyInput from '../../components/ArsMoneyInput.tsx'
import { reformatArsMoneyInput } from '../../components/arsMoneyInput.ts'
import { useI18n } from '../../i18n/useI18n.ts'

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
  const { t, numberFormat } = useI18n()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState(false)
  const [categoryName, setCategoryName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [optimisticCategory, setOptimisticCategory] = useState<Category | null>(null)
  const previousNumberFormat = useRef(numberFormat)
  useEffect(() => {
    if (previousNumberFormat.current === numberFormat) return
    setDraft((current) => current ? { ...current, amount: reformatArsMoneyInput(current.amount, false, previousNumberFormat.current, numberFormat) } : current)
    previousNumberFormat.current = numberFormat
  }, [numberFormat])
  const visibleCategories = useMemo(() => optimisticCategory && !categories.some((category) => category.id === optimisticCategory.id) ? [...categories, optimisticCategory] : categories, [categories, optimisticCategory])
  const categoryById = useMemo(() => new Map(visibleCategories.map((category) => [category.id, category])), [visibleCategories])
  const activeCategories = visibleCategories.filter((category) => !category.isArchived)
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
    setDraft({ spentOn: expense.spentOn, categoryId: expense.categoryId, amount: formatMoney(expense.amountCents, { symbol: false, locale: numberFormat }), description: expense.description ?? '' })
    setNewCategory(false)
    setError('')
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    const parsed = expenseSchema.safeParse(draft)
    const amount = parseMoneyToCents(draft.amount, numberFormat)
    if (!parsed.success || amount === null || amount <= 0) {
      setError(parsed.success ? t('expenseMustBePositive') : t('reviewData'))
      return
    }
    setBusy(true)
    try {
      const input = { categoryId: draft.categoryId, spentOn: draft.spentOn, description: draft.description.trim() || null, amountCents: amount }
      if (editingId) await vault.operation({ kind: 'expenses.update', id: editingId, input })
      else await vault.operation({ kind: 'expenses.create', input: { monthId, ...input } })
      setDraft(null)
      await onRefresh()
    } catch { setError(t('saveExpenseError')) } finally { setBusy(false) }
  }

  async function createCategory() {
    const parsed = categorySchema.safeParse({ name: categoryName })
    if (!parsed.success) { setError(t('reviewData')); return }
    setBusy(true)
    try {
      const category = await vault.operation<Category>({ kind: 'categories.create', input: { name: parsed.data.name, colorToken: null, isArchived: false } })
      setOptimisticCategory(category)
      setDraft((current) => current ? { ...current, categoryId: category.id } : current)
      await onCategoriesRefresh()
      setCategoryName('')
      setNewCategory(false)
      setError('')
    } catch { setError(t('categoryError')) } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleteId) return
    setBusy(true)
    try { await vault.operation({ kind: 'expenses.delete', id: deleteId }); setDeleteId(null); await onRefresh() } catch { setError(t('deleteExpenseError')) } finally { setBusy(false) }
  }

  return <section className="panel expenses-panel" aria-labelledby="expenses-title">
    <div className="section-heading"><div><p className="eyebrow">{t('expensesEyebrow')}</p><h2 id="expenses-title">{t('monthlyExpenses')}</h2></div><Button className="button button-secondary" type="button" onClick={startCreate} disabled={busy}>{t('newExpense')}</Button></div>
    {draft && <form className="inline-form expense-form" onSubmit={submit} noValidate>
      <label htmlFor="expense-date">{t('date')} <Input id="expense-date" data-dialog-autofocus type="date" value={draft.spentOn} onChange={(event) => setDraft((current) => current ? { ...current, spentOn: event.target.value } : current)} disabled={busy} /></label>
      <label htmlFor="expense-category">{t('category')} <select id="expense-category" value={draft.categoryId} onChange={(event) => setDraft((current) => current ? { ...current, categoryId: event.target.value } : current)} disabled={busy}><option value="" disabled>{t('chooseCategory')}</option>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isArchived ? ` (${t('archived').toLowerCase()})` : ''}</option>)}</select></label>
      <Button className="button button-small category-inline-trigger" type="button" onClick={() => setNewCategory((current) => !current)} disabled={busy}>{newCategory ? t('cancelCategory') : t('newCategory')}</Button>
      {newCategory && <div className="inline-category-form"><label htmlFor="expense-new-category">{t('categoryName')} <Input id="expense-new-category" autoFocus value={categoryName} onChange={(event) => setCategoryName(event.target.value)} disabled={busy} /></label><Button className="button button-small button-primary" type="button" onClick={createCategory} loading={busy} disabled={busy}>{t('createAndUse')}</Button></div>}
      <label htmlFor="expense-amount">{t('amountArs')} <ArsMoneyInput locale={numberFormat} id="expense-amount" value={draft.amount} onChange={(event) => setDraft((current) => current ? { ...current, amount: event.target.value } : current)} disabled={busy} /></label>
      <label htmlFor="expense-description">{t('description')} ({t('optional')}) <Input id="expense-description" value={draft.description} onChange={(event) => setDraft((current) => current ? { ...current, description: event.target.value } : current)} disabled={busy} /></label>
      <div className="form-actions"><Button className="button button-primary" type="submit" loading={busy} disabled={busy}>{t('saveExpense')}</Button><Button className="button button-secondary" type="button" onClick={() => setDraft(null)} disabled={busy}>{t('cancel')}</Button></div>
    </form>}
    {error && <p className="form-message error" role="alert">{error}</p>}
    {expenses.length === 0 ? <p className="empty-note">{t('noExpenses')}</p> : <div className="table-scroll"><table className="data-table"><caption className="sr-only">{t('monthlyExpenses')}</caption><thead><tr><th>{t('date')}</th><th>{t('category')}</th><th>{t('description')}</th><th className="amount-cell">{t('amount')}</th><th>{t('templateActions')}</th></tr></thead><tbody>{sortExpenses(expenses).map((expense) => <tr key={expense.id}><td>{expense.spentOn}</td><td>{categoryById.get(expense.categoryId)?.name ?? t('archivedCategory')}</td><td>{expense.description ?? t('noDescription')}</td><td className="amount-cell">{formatMoney(expense.amountCents, { locale: numberFormat })}</td><td className="row-actions"><Button className="button button-small" type="button" onClick={() => startEdit(expense)} disabled={busy}>{t('edit')}</Button><Button className="button button-small button-danger" type="button" onClick={() => setDeleteId(expense.id)} disabled={busy}>{t('delete')}</Button></td></tr>)}</tbody></table></div>}
    <aside className="expense-summary" aria-label={t('categorySummary')}><div className="section-heading"><h3>{t('categorySummary')}</h3><strong>{formatMoney(total, { locale: numberFormat })}</strong></div>{categoryTotals.size === 0 ? <p className="empty-note">{t('noExpensesSummary')}</p> : <ul>{Array.from(categoryTotals.entries()).map(([categoryId, amount]) => <li key={categoryId}><span>{categoryById.get(categoryId)?.name ?? t('archivedCategory')}</span><strong>{formatMoney(amount, { locale: numberFormat })}</strong></li>)}</ul>}</aside>
    {deleteId && <AccessibleDialog titleId="delete-expense-title" onClose={() => setDeleteId(null)}><div className="confirm-box"><strong id="delete-expense-title">{t('deleteExpenseTitle')}</strong><p>{t('undoWarning')}</p><div className="form-actions"><Button className="button button-danger" data-dialog-autofocus type="button" onClick={remove} loading={busy}>{t('delete')}</Button><Button className="button button-secondary" type="button" onClick={() => setDeleteId(null)} disabled={busy}>{t('cancel')}</Button></div></div></AccessibleDialog>}
  </section>
}
