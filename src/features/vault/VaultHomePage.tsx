import { Button, Input } from '@chakra-ui/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { Category, Debt, Expense, Month, RecurringDebtTemplate } from '../../domain/types.ts'
import { calculateMonthlySummary } from '../../domain/summary.ts'
import { formatMoney } from '../../domain/money.ts'
import DebtsTable from '../debts/DebtsTable.tsx'
import MonthCreationDialog, { type MonthCreated } from '../months/MonthCreationDialog.tsx'
import TemplatesPanel from '../months/TemplatesPanel.tsx'
import ExpensesPanel from '../expenses/ExpensesPanel.tsx'
import CategoriesPanel from '../expenses/CategoriesPanel.tsx'
import { parseSignedMoneyToCents } from '../months/money.ts'
import { useVaultSession } from './useVaultSession.ts'

const monthLabel = (month: Month): string => new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(month.year, month.month - 1, 1))

function VaultHomePage() {
  const navigate = useNavigate()
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
    } catch { setError('No se pudo cargar la bóveda.') }
  }, [vault, requestedMonthId])

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
    } catch { setError('No se pudieron cargar las deudas.') }
  }, [vault])

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
    const amount = parseSignedMoneyToCents(initialDraft)
    if (amount === null) { setError('El monto inicial no es válido.'); return }
    setBusy(true)
    try { await vault.operation({ kind: 'months.update', id: selected.id, input: { initialAmountCents: amount } }); setEditingInitial(false); await refreshAll() } catch { setError('No se pudo actualizar el monto inicial.') } finally { setBusy(false) }
  }

  async function save() { setBusy(true); try { await vault.save() } catch { /* session shows the export error */ } finally { setBusy(false) } }
  async function saveAs() { setBusy(true); try { await vault.saveAs() } catch { /* session shows the export error */ } finally { setBusy(false) } }
  async function saveCopy() { setBusy(true); try { await vault.saveCopy() } catch { /* session shows the export error */ } finally { setBusy(false) } }
  async function lock() { await vault.lock(); navigate('/') }

  const summary = useMemo(() => selected ? calculateMonthlySummary({ month: selected, debts, expenses }) : null, [selected, debts, expenses])
  const selectedIndex = selected ? months.findIndex((month) => month.id === selected.id) : -1
  const previous = selectedIndex >= 0 ? months[selectedIndex + 1] : undefined
  const next = selectedIndex > 0 ? months[selectedIndex - 1] : undefined

  if (vault.status !== 'unlocked') return <section className="page-section compact-section"><p className="eyebrow">Bóveda bloqueada</p><h1>Abre un archivo para continuar.</h1><Button className="button button-primary" onClick={() => navigate('/abrir')}>Abrir archivo</Button></section>

  return <section className="page-section vault-workspace">
    <header className="workspace-header"><div><p className="eyebrow">Bóveda</p><h1>Tu archivo está listo.</h1><p className="workspace-title">Planilla mensual</p>{vault.activeFileName ? <p className="file-link-status" role="status">Archivo vinculado: {vault.activeFileName}</p> : <p className="file-link-status" role="status">{vault.directFileAccessSupported ? 'Sin archivo vinculado todavía.' : 'Modo descarga: tu navegador no ofrece acceso directo al archivo.'}</p>}</div><div className="workspace-actions"><span className="dirty-state" aria-live="polite">{vault.dirty ? 'Cambios sin guardar' : 'Guardado'}</span><Button className="button button-primary" onClick={save} loading={busy} disabled={busy}>{vault.directFileAccessSupported ? (vault.activeFileName ? 'Guardar' : 'Elegir dónde guardar') : 'Descargar copia'}</Button><Button className="button button-secondary" onClick={lock} disabled={busy}>Bloquear</Button><details className="actions-menu"><summary>Acciones</summary><div className="menu-popover">{vault.directFileAccessSupported && <><button type="button" onClick={saveAs} disabled={busy}>Guardar como…</button><button type="button" onClick={saveCopy} disabled={busy}>Descargar copia</button></>}<Link className="menu-link" to="/boveda/historial">Historial</Link><button type="button" onClick={() => setShowTemplates(true)}>Plantillas</button><button type="button" onClick={() => setShowCategories(true)}>Categorías</button><button type="button" onClick={lock} disabled={busy}>Bloquear</button></div></details></div></header>
    {error && <p className="form-message error" role="alert">{error}</p>}
    {!loaded ? <p className="empty-note" role="status">Cargando meses…</p> : <>
      <div className="month-toolbar"><div className="month-nav"><Button className="button button-small" type="button" onClick={() => previous && setSelectedId(previous.id)} disabled={!previous}>← {previous ? monthLabel(previous) : 'Anterior'}</Button><label htmlFor="month-selector" className="sr-only">Seleccionar mes</label><select id="month-selector" value={selectedId ?? ''} onChange={(event) => setSelectedId(event.target.value || null)}><option value="" disabled>Seleccioná un mes</option>{months.map((month) => <option key={month.id} value={month.id}>{monthLabel(month)}</option>)}</select><Button className="button button-small" type="button" onClick={() => next && setSelectedId(next.id)} disabled={!next}>{next ? monthLabel(next) : 'Siguiente'} →</Button></div><Button className="button button-secondary" type="button" onClick={() => setShowNew(true)}>Nuevo mes</Button></div>
      {!selected ? <div className="empty-state"><h2>Empezá por crear tu primer mes</h2><p>Elegí el monto inicial y las plantillas que querés llevar a la planilla.</p><Button className="button button-primary" type="button" onClick={() => setShowNew(true)}>Crear primer mes</Button></div> : <>
        <section className="summary-grid" aria-label="Resumen del mes"><SummaryCell label="Monto inicial" value={formatMoney(selected.initialAmountCents)} action={<Button className="button button-small" type="button" onClick={() => { setInitialDraft(formatMoney(selected.initialAmountCents, { symbol: false })); setEditingInitial(true) }}>Editar</Button>} />{summary && <><SummaryCell label="Deuda pendiente" value={formatMoney(summary.debtPending)} /><SummaryCell label="Saldo" value={formatMoney(summary.balance)} /></>}</section>
        {editingInitial && <div className="inline-form initial-form"><label htmlFor="edit-initial">Monto inicial (ARS)</label><Input id="edit-initial" autoFocus inputMode="decimal" value={initialDraft} onChange={(event) => setInitialDraft(event.target.value)} /><Button className="button button-primary" type="button" onClick={updateInitial} loading={busy}>Guardar monto</Button><Button className="button button-secondary" type="button" onClick={() => setEditingInitial(false)} disabled={busy}>Cancelar</Button></div>}
        <DebtsTable key={selected.id} monthId={selected.id} debts={debts} onRefresh={() => loadMonthDetails(selected.id)} />
        <ExpensesPanel key={`expenses-${selected.id}`} monthId={selected.id} year={selected.year} month={selected.month} expenses={expenses} categories={categories} onRefresh={() => loadMonthDetails(selected.id)} onCategoriesRefresh={loadMonths} />
      </>}
    </>}
    {showNew && <MonthCreationDialog templates={templates} onClose={() => setShowNew(false)} onCreated={afterMonthCreated} />}
    {showTemplates && <TemplatesPanel templates={templates} onRefresh={loadMonths} onClose={() => setShowTemplates(false)} />}
    {showCategories && <CategoriesPanel categories={categories} onRefresh={loadMonths} onClose={() => setShowCategories(false)} />}
  </section>
}

function SummaryCell({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) { return <div className="summary-cell"><span>{label}</span><strong>{value}</strong>{action}</div> }

export default VaultHomePage
