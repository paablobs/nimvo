import { Button, Input } from '@chakra-ui/react'
import { useState } from 'react'
import { z } from 'zod'
import AccessibleDialog from '../../components/AccessibleDialog.tsx'
import type { Debt } from '../../domain/types.ts'
import { isValidCivilDate } from '../../domain/dates.ts'
import { formatMoney, parseMoneyToCents } from '../../domain/money.ts'
import { useVaultSession } from '../vault/useVaultSession.ts'

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
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function startCreate() { setEditingId(null); setDraft(blankDraft()); setError('') }
  function startEdit(debt: Debt) { setEditingId(debt.id); setDraft({ concept: debt.concept, amount: formatMoney(debt.amountCents, { symbol: false }), dueDate: debt.dueDate ?? '' }); setError('') }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    const parsed = debtSchema.safeParse(draft)
    const amount = parseMoneyToCents(draft.amount)
    if (!parsed.success || amount === null || amount <= 0) { setError(parsed.success ? 'El importe debe ser mayor que cero.' : parsed.error.issues[0]?.message ?? 'Revisá los datos.'); return }
    setBusy(true)
    try {
      if (editingId) await vault.operation({ kind: 'debts.update', id: editingId, input: { concept: draft.concept.trim(), amountCents: amount, dueDate: draft.dueDate || null } })
      else await vault.operation({ kind: 'debts.create', input: { monthId, templateId: null, concept: draft.concept.trim(), amountCents: amount, dueDate: draft.dueDate || null, paidAt: null } })
      setDraft(null)
      await onRefresh()
    } catch { setError('No se pudo guardar la deuda.') } finally { setBusy(false) }
  }

  async function toggle(debt: Debt) {
    setBusy(true)
    try { await vault.operation({ kind: 'debts.update', id: debt.id, input: { paidAt: debt.paidAt ? null : new Date().toISOString() } }); await onRefresh() } catch { setError('No se pudo actualizar el estado.') } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleteId) return
    setBusy(true)
    try { await vault.operation({ kind: 'debts.delete', id: deleteId }); setDeleteId(null); await onRefresh() } catch { setError('No se pudo eliminar la deuda.') } finally { setBusy(false) }
  }

  return <section className="panel debts-panel" aria-labelledby="debts-title">
    <div className="section-heading"><div><p className="eyebrow">Compromisos</p><h2 id="debts-title">Deudas</h2></div><Button className="button button-secondary" type="button" onClick={startCreate}>Nueva deuda</Button></div>
    {draft && <form className="inline-form debt-form" onSubmit={submit} noValidate>
      <label>Concepto <Input autoFocus value={draft.concept} onChange={(event) => setDraft({ ...draft, concept: event.target.value })} /></label>
      <label>Importe (ARS) <Input inputMode="decimal" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label>
      <label>Vencimiento <Input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></label>
      <div className="form-actions"><Button className="button button-primary" type="submit" loading={busy} disabled={busy}>Guardar deuda</Button><Button className="button button-secondary" type="button" onClick={() => setDraft(null)} disabled={busy}>Cancelar</Button></div>
    </form>}
    {error && <p className="form-message error" role="alert">{error}</p>}
    {debts.length === 0 ? <p className="empty-note">Todavía no hay deudas en este mes.</p> : <div className="table-scroll"><table className="data-table"><caption className="sr-only">Deudas del mes</caption><thead><tr><th>Vencimiento</th><th>Concepto</th><th className="amount-cell">Importe</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{debts.map((debt) => <tr key={debt.id}><td>{debt.dueDate ?? 'Sin fecha'}</td><td>{debt.concept}</td><td className="amount-cell">{formatMoney(debt.amountCents)}</td><td><span className={debt.paidAt ? 'status status-paid' : 'status'}>{debt.paidAt ? 'Pagada' : 'Pendiente'}</span></td><td className="row-actions"><Button className="button button-small" type="button" onClick={() => toggle(debt)} disabled={busy}>{debt.paidAt ? 'Volver pendiente' : 'Marcar pagada'}</Button><Button className="button button-small" type="button" onClick={() => startEdit(debt)} disabled={busy}>Editar</Button><Button className="button button-small button-danger" type="button" onClick={() => setDeleteId(debt.id)} disabled={busy}>Eliminar</Button></td></tr>)}</tbody></table></div>}
    {deleteId && <AccessibleDialog titleId="delete-debt-title" onClose={() => setDeleteId(null)}><div className="confirm-box"><strong id="delete-debt-title">¿Eliminar esta deuda?</strong><p>La acción no se puede deshacer.</p><div className="form-actions"><Button className="button button-danger" data-dialog-autofocus type="button" onClick={remove} loading={busy}>Eliminar</Button><Button className="button button-secondary" type="button" onClick={() => setDeleteId(null)} disabled={busy}>Cancelar</Button></div></div></AccessibleDialog>}
  </section>
}
