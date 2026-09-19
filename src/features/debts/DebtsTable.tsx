import { Button, Input } from '@chakra-ui/react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import AccessibleDialog from '../../components/AccessibleDialog.tsx'
import type { Debt } from '../../domain/types.ts'
import { isValidCivilDate } from '../../domain/dates.ts'
import { formatMoney, parseMoneyToCents } from '../../domain/money.ts'
import { useVaultSession } from '../vault/useVaultSession.ts'
import ArsMoneyInput from '../../components/ArsMoneyInput.tsx'
import { reformatArsMoneyInput } from '../../components/arsMoneyInput.ts'
import { useI18n } from '../../i18n/useI18n.ts'

const debtSchema = z.object({ concept: z.string().trim().min(1, 'Escribí un concepto.'), dueDate: z.string().refine((value) => value === '' || isValidCivilDate(value), 'La fecha de vencimiento no es válida.') })

interface Props {
  monthId: string
  debts: Debt[]
  onRefresh: () => Promise<void>
}

type Draft = { concept: string; amount: string; dueDate: string }
const blankDraft = (): Draft => ({ concept: '', amount: '', dueDate: '' })

export default function DebtsTable({ monthId, debts, onRefresh }: Props) {
  const vault = useVaultSession()
  const { t, numberFormat } = useI18n()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const previousNumberFormat = useRef(numberFormat)

  useEffect(() => {
    if (previousNumberFormat.current === numberFormat) return
    setDraft((current) => current ? { ...current, amount: reformatArsMoneyInput(current.amount, false, previousNumberFormat.current, numberFormat) } : current)
    previousNumberFormat.current = numberFormat
  }, [numberFormat])

  function startCreate() { setEditingId(null); setDraft(blankDraft()); setError('') }
  function startEdit(debt: Debt) { setEditingId(debt.id); setDraft({ concept: debt.concept, amount: formatMoney(debt.amountCents, { symbol: false, locale: numberFormat }), dueDate: debt.dueDate ?? '' }); setError('') }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    const parsed = debtSchema.safeParse(draft)
    const amount = parseMoneyToCents(draft.amount, numberFormat)
    if (!parsed.success || amount === null || amount <= 0) { setError(parsed.success ? t('expenseMustBePositive') : t('reviewData')); return }
    setBusy(true)
    try {
      if (editingId) await vault.operation({ kind: 'debts.update', id: editingId, input: { concept: draft.concept.trim(), amountCents: amount, dueDate: draft.dueDate || null } })
      else await vault.operation({ kind: 'debts.create', input: { monthId, templateId: null, concept: draft.concept.trim(), amountCents: amount, dueDate: draft.dueDate || null, paidAt: null } })
      setDraft(null)
      await onRefresh()
    } catch { setError(t('saveExpenseError')) } finally { setBusy(false) }
  }

  async function toggle(debt: Debt) {
    setBusy(true)
    try { await vault.operation({ kind: 'debts.update', id: debt.id, input: { paidAt: debt.paidAt ? null : new Date().toISOString() } }); await onRefresh() } catch { setError(t('statusUpdateError')) } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleteId) return
    setBusy(true)
    try { await vault.operation({ kind: 'debts.delete', id: deleteId }); setDeleteId(null); await onRefresh() } catch { setError(t('deleteFixedError')) } finally { setBusy(false) }
  }

  return <section className="panel debts-panel" aria-labelledby="debts-title">
    <div className="section-heading"><div><p className="eyebrow">{t('fixedExpensesEyebrow')}</p><h2 id="debts-title">{t('fixedExpenses')}</h2></div><Button className="button button-secondary" type="button" onClick={startCreate}>{t('newFixedExpense')}</Button></div>
    {draft && <form className="inline-form debt-form" onSubmit={submit} noValidate>
      <label>{t('concept')} <Input autoFocus value={draft.concept} onChange={(event) => setDraft({ ...draft, concept: event.target.value })} /></label>
      <label>{t('amountArs')} <ArsMoneyInput locale={numberFormat} value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
      <label>{t('dueDate')} <Input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></label>
      <div className="form-actions"><Button className="button button-primary" type="submit" loading={busy} disabled={busy}>{t('saveFixedExpense')}</Button><Button className="button button-secondary" type="button" onClick={() => setDraft(null)} disabled={busy}>{t('cancel')}</Button></div>
    </form>}
    {error && <p className="form-message error" role="alert">{error}</p>}
    {debts.length === 0 ? <p className="empty-note">{t('noFixedExpenses')}</p> : <div className="table-scroll"><table className="data-table"><caption className="sr-only">{t('noFixedExpenses')}</caption><thead><tr><th>{t('dueDate')}</th><th>{t('concept')}</th><th className="amount-cell">{t('amount')}</th><th>{t('status')}</th><th>{t('templateActions')}</th></tr></thead><tbody>{debts.map((debt) => <tr key={debt.id}><td>{debt.dueDate ?? t('dueWithoutDate')}</td><td>{debt.concept}</td><td className="amount-cell">{formatMoney(debt.amountCents, { locale: numberFormat })}</td><td><span className={debt.paidAt ? 'status status-paid' : 'status'}>{debt.paidAt ? t('paid') : t('pending')}</span></td><td className="row-actions"><Button className="button button-small" type="button" onClick={() => toggle(debt)} disabled={busy}>{debt.paidAt ? t('markPending') : t('markPaid')}</Button><Button className="button button-small" type="button" onClick={() => startEdit(debt)} disabled={busy}>{t('edit')}</Button><Button className="button button-small button-danger" type="button" onClick={() => setDeleteId(debt.id)} disabled={busy}>{t('delete')}</Button></td></tr>)}</tbody></table></div>}
    {deleteId && <AccessibleDialog titleId="delete-debt-title" onClose={() => setDeleteId(null)}><div className="confirm-box"><strong id="delete-debt-title">{t('deleteFixedTitle')}</strong><p>{t('undoWarning')}</p><div className="form-actions"><Button className="button button-danger" data-dialog-autofocus type="button" onClick={remove} loading={busy}>{t('delete')}</Button><Button className="button button-secondary" type="button" onClick={() => setDeleteId(null)} disabled={busy}>{t('cancel')}</Button></div></div></AccessibleDialog>}
  </section>
}
