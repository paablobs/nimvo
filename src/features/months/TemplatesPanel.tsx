import { Button, Input } from '@chakra-ui/react'
import { useState } from 'react'
import { z } from 'zod'
import AccessibleDialog from '../../components/AccessibleDialog.tsx'
import type { RecurringDebtTemplate } from '../../domain/types.ts'
import { formatMoney, parseMoneyToCents } from '../../domain/money.ts'
import { useVaultSession } from '../vault/useVaultSession.ts'
import ArsMoneyInput from '../../components/ArsMoneyInput.tsx'

const templateSchema = z.object({ concept: z.string().trim().min(1, 'Escribí un concepto.'), dueDay: z.number().int().min(1).max(31).nullable() })
interface Props { templates: RecurringDebtTemplate[]; onRefresh: () => Promise<void>; onClose: () => void }
type Draft = { concept: string; amount: string; dueDay: string; isActive: boolean }

export default function TemplatesPanel({ templates, onRefresh, onClose }: Props) {
  const vault = useVaultSession()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function edit(template?: RecurringDebtTemplate) {
    setEditingId(template?.id ?? null)
    setDraft(template ? { concept: template.concept, amount: template.defaultAmountCents === null ? '' : formatMoney(template.defaultAmountCents, { symbol: false }), dueDay: template.dueDay === null ? '' : String(template.dueDay), isActive: template.isActive } : { concept: '', amount: '', dueDay: '', isActive: true })
    setError('')
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    const dueDay = draft.dueDay.trim() === '' ? null : Number(draft.dueDay)
    const parsed = templateSchema.safeParse({ concept: draft.concept, dueDay })
    const amountText = draft.amount.trim()
    const amount = amountText === '' ? null : parseMoneyToCents(amountText)
    if (!parsed.success || (amountText !== '' && (amount === null || amount < 0))) { setError(parsed.success ? 'El importe no es válido.' : parsed.error.issues[0]?.message ?? 'Revisá los datos.'); return }
    setBusy(true)
    try {
      if (editingId) await vault.operation({ kind: 'templates.update', id: editingId, input: { concept: draft.concept.trim(), defaultAmountCents: amount, dueDay, isActive: draft.isActive } })
      else await vault.operation({ kind: 'templates.create', input: { concept: draft.concept.trim(), defaultAmountCents: amount, dueDay, isActive: draft.isActive } })
      setDraft(null)
      await onRefresh()
    } catch { setError('No se pudo guardar la plantilla.') } finally { setBusy(false) }
  }

  async function toggle(template: RecurringDebtTemplate) {
    setBusy(true)
    try {
      if (template.isActive) await vault.operation({ kind: 'templates.archive', id: template.id })
      else await vault.operation({ kind: 'templates.update', id: template.id, input: { isActive: true } })
      await onRefresh()
    } catch { setError('No se pudo cambiar el estado.') } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleteId) return
    setBusy(true)
    try { await vault.operation({ kind: 'templates.delete', id: deleteId }); setDeleteId(null); await onRefresh() } catch { setError('No se pudo eliminar la plantilla.') } finally { setBusy(false) }
  }

  return <AccessibleDialog titleId="templates-title" onClose={onClose} className="template-manager"><div className="dialog-heading"><div><p className="eyebrow">Configuración</p><h2 id="templates-title">Plantillas</h2></div><Button className="button button-secondary" type="button" onClick={onClose} aria-label="Cerrar plantillas">Cerrar</Button></div>
    <p className="field-help">Las plantillas activas aparecen al crear un mes. Un importe vacío significa que se completa en cada alta.</p>
    {draft && <form className="inline-form" onSubmit={submit} noValidate><label>Concepto <Input autoFocus value={draft.concept} onChange={(event) => setDraft({ ...draft, concept: event.target.value })} /></label><label>Importe (ARS, opcional) <ArsMoneyInput value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label><label>Día de vencimiento <Input type="number" min={1} max={31} placeholder="Sin día" value={draft.dueDay} onChange={(event) => setDraft({ ...draft, dueDay: event.target.value })} /></label><label className="checkbox-label"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} /> Activa</label><div className="form-actions"><Button className="button button-primary" type="submit" loading={busy}>Guardar plantilla</Button><Button className="button button-secondary" type="button" onClick={() => setDraft(null)} disabled={busy}>Cancelar</Button></div></form>}
    {!draft && <Button className="button button-secondary" type="button" onClick={() => edit()}>Nueva plantilla</Button>}
    {templates.length === 0 ? <p className="empty-note">Todavía no hay plantillas.</p> : <div className="table-scroll"><table className="data-table"><caption className="sr-only">Plantillas de gastos fijos</caption><thead><tr><th>Concepto</th><th>Importe</th><th>Día</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{templates.map((template) => <tr key={template.id}><td>{template.concept}</td><td className="amount-cell">{template.defaultAmountCents === null ? 'Por completar' : formatMoney(template.defaultAmountCents)}</td><td>{template.dueDay ?? 'Sin día'}</td><td>{template.isActive ? 'Activa' : 'Archivada'}</td><td className="row-actions"><Button className="button button-small" type="button" onClick={() => edit(template)} disabled={busy}>Editar</Button><Button className="button button-small" type="button" onClick={() => toggle(template)} disabled={busy}>{template.isActive ? 'Archivar' : 'Activar'}</Button><Button className="button button-small button-danger" type="button" onClick={() => setDeleteId(template.id)} disabled={busy}>Eliminar</Button></td></tr>)}</tbody></table></div>}
    {deleteId && <AccessibleDialog titleId="delete-template-title" onClose={() => setDeleteId(null)}><div className="confirm-box"><strong id="delete-template-title">¿Eliminar esta plantilla?</strong><p>Los gastos fijos ya creados no se modifican.</p><div className="form-actions"><Button className="button button-danger" data-dialog-autofocus type="button" onClick={remove} loading={busy}>Eliminar</Button><Button className="button button-secondary" type="button" onClick={() => setDeleteId(null)} disabled={busy}>Cancelar</Button></div></div></AccessibleDialog>}
    {error && <p className="form-message error" role="alert">{error}</p>}
  </AccessibleDialog>
}
