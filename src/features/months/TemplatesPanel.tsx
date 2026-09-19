import { Button, Input } from '@chakra-ui/react'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import AccessibleDialog from '../../components/AccessibleDialog.tsx'
import type { RecurringDebtTemplate } from '../../domain/types.ts'
import { formatMoney, parseMoneyToCents } from '../../domain/money.ts'
import { useVaultSession } from '../vault/useVaultSession.ts'
import ArsMoneyInput from '../../components/ArsMoneyInput.tsx'
import { reformatArsMoneyInput } from '../../components/arsMoneyInput.ts'
import { useI18n } from '../../i18n/useI18n.ts'

const templateSchema = z.object({ concept: z.string().trim().min(1, 'Escribí un concepto.'), dueDay: z.number().int().min(1).max(31).nullable() })
interface Props { templates: RecurringDebtTemplate[]; onRefresh: () => Promise<void>; onClose: () => void }
type Draft = { concept: string; amount: string; dueDay: string; isActive: boolean }

export default function TemplatesPanel({ templates, onRefresh, onClose }: Props) {
  const vault = useVaultSession()
  const { t, numberFormat } = useI18n()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const previousNumberFormat = useRef(numberFormat)
  useEffect(() => {
    if (previousNumberFormat.current === numberFormat) return
    setDraft((current) => current ? { ...current, amount: reformatArsMoneyInput(current.amount, false, previousNumberFormat.current, numberFormat) } : current)
    previousNumberFormat.current = numberFormat
  }, [numberFormat])

  function edit(template?: RecurringDebtTemplate) {
    setEditingId(template?.id ?? null)
    setDraft(template ? { concept: template.concept, amount: template.defaultAmountCents === null ? '' : formatMoney(template.defaultAmountCents, { symbol: false, locale: numberFormat }), dueDay: template.dueDay === null ? '' : String(template.dueDay), isActive: template.isActive } : { concept: '', amount: '', dueDay: '', isActive: true })
    setError('')
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    const dueDay = draft.dueDay.trim() === '' ? null : Number(draft.dueDay)
    const parsed = templateSchema.safeParse({ concept: draft.concept, dueDay })
    const amountText = draft.amount.trim()
    const amount = amountText === '' ? null : parseMoneyToCents(amountText, numberFormat)
    if (!parsed.success || (amountText !== '' && (amount === null || amount < 0))) { setError(t('reviewData')); return }
    setBusy(true)
    try {
      if (editingId) await vault.operation({ kind: 'templates.update', id: editingId, input: { concept: draft.concept.trim(), defaultAmountCents: amount, dueDay, isActive: draft.isActive } })
      else await vault.operation({ kind: 'templates.create', input: { concept: draft.concept.trim(), defaultAmountCents: amount, dueDay, isActive: draft.isActive } })
      setDraft(null)
      await onRefresh()
    } catch { setError(t('templateError')) } finally { setBusy(false) }
  }

  async function toggle(template: RecurringDebtTemplate) {
    setBusy(true)
    try {
      if (template.isActive) await vault.operation({ kind: 'templates.archive', id: template.id })
      else await vault.operation({ kind: 'templates.update', id: template.id, input: { isActive: true } })
      await onRefresh()
    } catch { setError(t('templateStatusError')) } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleteId) return
    setBusy(true)
    try { await vault.operation({ kind: 'templates.delete', id: deleteId }); setDeleteId(null); await onRefresh() } catch { setError(t('templateDeleteError')) } finally { setBusy(false) }
  }

  return <AccessibleDialog titleId="templates-title" onClose={onClose} className="template-manager"><div className="dialog-heading"><div><p className="eyebrow">{t('settings')}</p><h2 id="templates-title">{t('templates')}</h2></div><Button className="button button-secondary" type="button" onClick={onClose} aria-label={t('closeTemplates')}>{t('close')}</Button></div>
    <p className="field-help">{t('templatesHelp')}</p>
    {draft && <form className="inline-form" onSubmit={submit} noValidate><label>{t('concept')} <Input autoFocus value={draft.concept} onChange={(event) => setDraft({ ...draft, concept: event.target.value })} /></label><label>{t('amountArs')} ({t('optional')}) <ArsMoneyInput locale={numberFormat} value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></label><label>{t('dueDate')} <Input type="number" min={1} max={31} placeholder={t('noDay')} value={draft.dueDay} onChange={(event) => setDraft({ ...draft, dueDay: event.target.value })} /></label><label className="checkbox-label"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} /> {t('active')}</label><div className="form-actions"><Button className="button button-primary" type="submit" loading={busy}>{t('saveTemplate')}</Button><Button className="button button-secondary" type="button" onClick={() => setDraft(null)} disabled={busy}>{t('cancel')}</Button></div></form>}
    {!draft && <Button className="button button-secondary" type="button" onClick={() => edit()}>{t('newTemplate')}</Button>}
    {templates.length === 0 ? <p className="empty-note">{t('noTemplates')}</p> : <div className="table-scroll"><table className="data-table"><caption className="sr-only">{t('recurringExpenses')}</caption><thead><tr><th>{t('concept')}</th><th>{t('amount')}</th><th>{t('day')}</th><th>{t('status')}</th><th>{t('templateActions')}</th></tr></thead><tbody>{templates.map((template) => <tr key={template.id}><td>{template.concept}</td><td className="amount-cell">{template.defaultAmountCents === null ? t('fillLater') : formatMoney(template.defaultAmountCents, { locale: numberFormat })}</td><td>{template.dueDay ?? t('noDay')}</td><td>{template.isActive ? t('active') : t('archived')}</td><td className="row-actions"><Button className="button button-small" type="button" onClick={() => edit(template)} disabled={busy}>{t('edit')}</Button><Button className="button button-small" type="button" onClick={() => toggle(template)} disabled={busy}>{template.isActive ? t('archive') : t('activate')}</Button><Button className="button button-small button-danger" type="button" onClick={() => setDeleteId(template.id)} disabled={busy}>{t('delete')}</Button></td></tr>)}</tbody></table></div>}
    {deleteId && <AccessibleDialog titleId="delete-template-title" onClose={() => setDeleteId(null)}><div className="confirm-box"><strong id="delete-template-title">{t('deleteTemplateTitle')}</strong><p>{t('templateDeleteWarning')}</p><div className="form-actions"><Button className="button button-danger" data-dialog-autofocus type="button" onClick={remove} loading={busy}>{t('delete')}</Button><Button className="button button-secondary" type="button" onClick={() => setDeleteId(null)} disabled={busy}>{t('cancel')}</Button></div></div></AccessibleDialog>}
    {error && <p className="form-message error" role="alert">{error}</p>}
  </AccessibleDialog>
}
