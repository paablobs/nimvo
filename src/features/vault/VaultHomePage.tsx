import { Button } from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Category, Debt, Expense, Month, RecurringDebtTemplate } from '../../domain/types.ts'
import { calculateMonthlySummary } from '../../domain/summary.ts'
import { formatCurrency } from '../../domain/money.ts'
import DebtsTable from '../debts/DebtsTable.tsx'
import MonthCreationDialog, { type MonthCreated } from '../months/MonthCreationDialog.tsx'
import TemplatesPanel from '../months/TemplatesPanel.tsx'
import ExpensesPanel from '../expenses/ExpensesPanel.tsx'
import CategoriesPanel from '../expenses/CategoriesPanel.tsx'
import { parseSignedMoneyToCents } from '../months/money.ts'
import { useVaultSession } from './useVaultSession.ts'
import ArsMoneyInput from '../../components/ArsMoneyInput.tsx'
import { reformatArsMoneyInput } from '../../components/arsMoneyInput.ts'
import { useI18n } from '../../i18n/useI18n.ts'

const monthLabel = (month: Month, locale: string): string => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(month.year, month.month - 1, 1))

function VaultHomePage() {
  const navigate = useNavigate()
  const { t, numberFormat, locale } = useI18n()
  const [searchParams] = useSearchParams()
  const requestedMonthId = searchParams.get('month')
  const vault = useVaultSession()
  const [months, setMonths] = useState<Month[]>([])
  const [templates, setTemplates] = useState<RecurringDebtTemplate[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [debts, setDebts] = useState<Debt[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showCategories, setShowCategories] = useState(false)
  const [editingInitial, setEditingInitial] = useState(false)
  const [initialDraft, setInitialDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const detailsRequest = useRef(0)
  const actionsMenuRef = useRef<HTMLDetailsElement>(null)
  const previousNumberFormat = useRef(numberFormat)

  useEffect(() => {
    if (previousNumberFormat.current === numberFormat) return
    setInitialDraft((current) => reformatArsMoneyInput(current, true, previousNumberFormat.current, numberFormat))
    previousNumberFormat.current = numberFormat
  }, [numberFormat])

  const selected = months.find((month) => month.id === selectedId) ?? null

  const loadMonths = useCallback(async () => {
    try {
      const [nextMonths, nextTemplates, nextCategories] = await Promise.all([
        vault.operation<Month[]>({ kind: 'months.list' }),
        vault.operation<RecurringDebtTemplate[]>({ kind: 'templates.list', activeOnly: false }),
        vault.operation<Category[]>({ kind: 'categories.list', includeArchived: true }),
      ])
      setMonths(nextMonths)
      setTemplates(nextTemplates)
      setCategories(nextCategories ?? [])
      setSelectedId((current) => requestedMonthId && nextMonths.some((month) => month.id === requestedMonthId)
        ? requestedMonthId
        : current && nextMonths.some((month) => month.id === current) ? current : nextMonths[0]?.id ?? null)
      setLoaded(true)
    } catch { setError(t('vaultLoadError')) }
  }, [vault, requestedMonthId, t])

  const loadMonthDetails = useCallback(async (monthId: string) => {
    const request = detailsRequest.current + 1
    detailsRequest.current = request
    try {
      const [nextDebts, nextExpenses] = await Promise.all([
        vault.operation<Debt[]>({ kind: 'debts.list', monthId }),
        vault.operation<Expense[]>({ kind: 'expenses.list', monthId }),
      ])
      if (request !== detailsRequest.current) return
      setDebts(nextDebts)
      setExpenses(nextExpenses)
    } catch { setError(t('expensesLoadError')) }
  }, [vault, t])

  useEffect(() => {
    if (vault.status !== 'unlocked') return
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void loadMonths() })
    return () => { cancelled = true }
  }, [vault.status, loadMonths])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) void loadMonthDetails(selectedId) })
    return () => { cancelled = true }
  }, [selectedId, loadMonthDetails])

  async function refreshAll() {
    await loadMonths()
    if (selectedId) await loadMonthDetails(selectedId)
  }

  async function afterMonthCreated(created: MonthCreated) {
    await loadMonths()
    setSelectedId(created.id)
    await loadMonthDetails(created.id)
  }

  async function updateInitial() {
    if (!selected) return
    const amount = parseSignedMoneyToCents(initialDraft, numberFormat)
    if (amount === null) { setError(t('incomeInvalid')); return }
    setBusy(true)
    try { await vault.operation({ kind: 'months.update', id: selected.id, input: { initialAmountCents: amount } }); setEditingInitial(false); await refreshAll() } catch { setError(t('incomeUpdateError')) } finally { setBusy(false) }
  }

  async function save() { setBusy(true); try { await vault.save() } catch { /* session shows the export error */ } finally { setBusy(false) } }
  async function saveAs() { setBusy(true); try { await vault.saveAs() } catch { /* session shows the export error */ } finally { setBusy(false) } }
  async function saveCopy() { setBusy(true); try { await vault.saveCopy() } catch { /* session shows the export error */ } finally { setBusy(false) } }
  async function lock() { await vault.lock(); navigate('/') }
  function closeActionsMenu() { if (actionsMenuRef.current) actionsMenuRef.current.open = false }

  const summary = useMemo(() => selected ? calculateMonthlySummary({ month: selected, debts, expenses }) : null, [selected, debts, expenses])
  const selectedIndex = selected ? months.findIndex((month) => month.id === selected.id) : -1
  const previous = selectedIndex >= 0 ? months[selectedIndex + 1] : undefined
  const next = selectedIndex > 0 ? months[selectedIndex - 1] : undefined

  if (vault.status !== 'unlocked') return <section className="page-section compact-section"><p className="eyebrow">{t('lockedVault')}</p><h1>{t('openToContinue')}</h1><Button className="button button-primary" onClick={() => navigate('/abrir')}>{t('openFile')}</Button></section>

  return <section className="page-section vault-workspace">
    <header className="workspace-header"><div><p className="eyebrow">{t('vault')}</p><h1>{t('readyTitle')}</h1><p className="workspace-title">{t('monthlySheet')}</p>{vault.activeFileName ? <p className="file-link-status" role="status">{t('linkedFile', { name: vault.activeFileName })}</p> : <p className="file-link-status" role="status">{vault.directFileAccessSupported ? t('noLinkedFile') : t('downloadMode')}</p>}</div><div className="workspace-actions"><div className="workspace-action-buttons"><Button className="button button-primary" onClick={save} loading={busy} disabled={busy}>{vault.directFileAccessSupported ? (vault.activeFileName ? t('save') : t('chooseSaveLocation')) : t('downloadCopy')}</Button><Button className="button button-secondary" onClick={() => { closeActionsMenu(); void lock() }} disabled={busy}>{t('lock')}</Button><details ref={actionsMenuRef} className="actions-menu"><summary>{t('actions')}</summary><div className="menu-popover">{vault.directFileAccessSupported && <><button type="button" onClick={() => { closeActionsMenu(); void saveAs() }} disabled={busy}>{t('saveAs')}</button><button type="button" onClick={() => { closeActionsMenu(); void saveCopy() }} disabled={busy}>{t('downloadCopy')}</button></>}<Link className="menu-link" to="/boveda/historial" onClick={closeActionsMenu}>{t('history')}</Link><button type="button" onClick={() => { closeActionsMenu(); setShowTemplates(true) }}>{t('templates')}</button><button type="button" onClick={() => { closeActionsMenu(); setShowCategories(true) }}>{t('categories')}</button><button type="button" onClick={() => { closeActionsMenu(); void lock() }} disabled={busy}>{t('lock')}</button></div></details></div><span className="dirty-state" aria-live="polite">{vault.dirty ? t('unsavedChanges') : t('saved')}</span></div></header>
    {error && <p className="form-message error" role="alert">{error}</p>}
    {!loaded ? <p className="empty-note" role="status">{t('loadingMonths')}</p> : <>
      <div className="month-toolbar"><div className="month-nav"><Button className="button button-small" type="button" onClick={() => previous && setSelectedId(previous.id)} disabled={!previous}>← {previous ? monthLabel(previous, locale === 'es' ? 'es-AR' : 'en-US') : t('previous')}</Button><label htmlFor="month-selector" className="sr-only">{t('selectMonth')}</label><select id="month-selector" value={selectedId ?? ''} onChange={(event) => setSelectedId(event.target.value || null)}><option value="" disabled>{t('selectMonth')}</option>{months.map((month) => <option key={month.id} value={month.id}>{monthLabel(month, locale === 'es' ? 'es-AR' : 'en-US')}</option>)}</select><Button className="button button-small" type="button" onClick={() => next && setSelectedId(next.id)} disabled={!next}>{next ? monthLabel(next, locale === 'es' ? 'es-AR' : 'en-US') : t('next')} →</Button></div><Button className="button button-secondary" type="button" onClick={() => setShowNew(true)}>{t('newMonth')}</Button></div>
      {!selected ? <div className="empty-state"><h2>{t('firstMonthTitle')}</h2><p>{t('firstMonthLead')}</p><Button className="button button-primary" type="button" onClick={() => setShowNew(true)}>{t('createFirstMonth')}</Button></div> : <>
        <section className="summary-grid" aria-label={t('monthSummary')}><SummaryCell label={t('income')} value={formatCurrency(selected.initialAmountCents, vault.currency, { locale: numberFormat })} action={<Button className="button button-small" type="button" onClick={() => { setInitialDraft(formatCurrency(selected.initialAmountCents, vault.currency, { symbol: false, locale: numberFormat })); setEditingInitial(true) }}>{t('edit')}</Button>} />{summary && <><SummaryCell label={t('pendingFixed')} value={formatCurrency(summary.debtPending, vault.currency, { locale: numberFormat })} /><SummaryCell label={t('balance')} value={formatCurrency(summary.balance, vault.currency, { locale: numberFormat })} tone={summary.balance < 0 ? 'negative' : summary.balance > 0 ? 'positive' : undefined} /></>}</section>
        {editingInitial && <div className="inline-form initial-form"><label htmlFor="edit-initial">{t('amountCurrency', { currency: vault.currency })}</label><ArsMoneyInput id="edit-initial" autoFocus allowNegative locale={numberFormat} value={initialDraft} onChange={(event) => setInitialDraft(event.target.value)} /><Button className="button button-primary" type="button" onClick={updateInitial} loading={busy}>{t('saveIncome')}</Button><Button className="button button-secondary" type="button" onClick={() => setEditingInitial(false)} disabled={busy}>{t('cancel')}</Button></div>}
        <DebtsTable key={selected.id} monthId={selected.id} debts={debts} currency={vault.currency} onRefresh={() => loadMonthDetails(selected.id)} />
        <ExpensesPanel key={`expenses-${selected.id}`} monthId={selected.id} year={selected.year} month={selected.month} expenses={expenses} categories={categories} currency={vault.currency} onRefresh={() => loadMonthDetails(selected.id)} onCategoriesRefresh={loadMonths} />
      </>}
    </>}
    {showNew && <MonthCreationDialog existingMonths={months} templates={templates} currency={vault.currency} onClose={() => setShowNew(false)} onCreated={afterMonthCreated} />}
    {showTemplates && <TemplatesPanel templates={templates} currency={vault.currency} onRefresh={loadMonths} onClose={() => setShowTemplates(false)} />}
    {showCategories && <CategoriesPanel categories={categories} onRefresh={loadMonths} onClose={() => setShowCategories(false)} />}
  </section>
}

function SummaryCell({ label, value, action, tone }: { label: string; value: string; action?: React.ReactNode; tone?: 'positive' | 'negative' }) { return <div className="summary-cell"><div className="summary-cell-header"><span>{label}</span>{action}</div><strong className={tone ? `${tone}-amount` : undefined}>{value}</strong></div> }

export default VaultHomePage
