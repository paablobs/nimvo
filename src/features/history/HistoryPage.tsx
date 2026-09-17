import { useEffect, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { formatMoney } from '../../domain/money.ts'
import type { CategoryBreakdown, MonthlyHistoryRow } from '../../domain/history.ts'
import { useVaultSession } from '../vault/useVaultSession.ts'

const monthLabel = (row: MonthlyHistoryRow): string => new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(row.year, row.month - 1, 1))

function HistoryPage() {
  const navigate = useNavigate()
  const vault = useVaultSession()
  const [rows, setRows] = useState<MonthlyHistoryRow[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const pageId = useId().replace(/:/g, '')

  useEffect(() => {
    if (vault.status !== 'unlocked') return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setLoadState('loading')
      setError('')
      void vault.operation<MonthlyHistoryRow[]>({ kind: 'history.list' }).then((nextRows) => {
        if (cancelled) return
        setRows(nextRows)
        setLoadState('ready')
      }).catch(() => {
        if (cancelled) return
        setRows([])
        setError('No se pudo cargar el historial.')
        setLoadState('error')
      })
    })
    return () => { cancelled = true }
  }, [vault, vault.status])

  if (vault.status !== 'unlocked') {
    return <section className="page-section compact-section history-locked" aria-labelledby="history-locked-title">
      <p className="eyebrow">Historial</p>
      <h1 id="history-locked-title">Abrí la bóveda para ver tus meses.</h1>
      <button className="button button-primary" type="button" onClick={() => navigate('/abrir')}>Abrir archivo</button>
    </section>
  }

  return <section className="page-section history-page" aria-labelledby="history-title">
    <header className="history-header">
      <div>
        <p className="eyebrow">Bóveda / historial</p>
        <h1 id="history-title">Historial mensual</h1>
        <p className="history-lede">Una vista comparativa de cada mes, en el orden más reciente.</p>
      </div>
      <Link className="button button-secondary" to="/boveda">Volver al mes</Link>
    </header>

    {loadState === 'error' && <p className="form-message error" role="alert">{error}</p>}
    {loadState === 'loading' && <p className="empty-note" role="status">Cargando historial…</p>}
    {loadState === 'ready' && rows.length === 0 && <div className="empty-state history-empty"><h2>Todavía no hay meses</h2><p>Creá un mes en la planilla para empezar a guardar su historial.</p><Link className="button button-primary" to="/boveda">Ir a la planilla</Link></div>}
    {loadState === 'ready' && rows.length > 0 && <div className="history-table-scroll">
      <table className="data-table history-table" aria-label="Historial mensual">
        <caption className="sr-only">Comparación de montos por mes</caption>
        <thead><tr>
          <th scope="col">Mes</th>
          <th scope="col" className="amount-cell">Monto inicial</th>
          <th scope="col" className="amount-cell">Deuda total</th>
          <th scope="col" className="amount-cell">Deuda pendiente</th>
          <th scope="col" className="amount-cell">Gastos diarios</th>
          <th scope="col" className="amount-cell">Saldo</th>
          <th scope="col"><span className="sr-only">Desglose</span></th>
        </tr></thead>
        <tbody>{rows.map((row, index) => {
          const key = row.monthId
          const detailId = `${pageId}-detail-${index}`
          const isExpanded = expanded[key] === true
          return <HistoryRow
            key={key}
            row={row}
            detailId={detailId}
            expanded={isExpanded}
            onToggle={() => setExpanded((current) => ({ ...current, [key]: !isExpanded }))}
          />
        })}</tbody>
      </table>
    </div>}
  </section>
}

function HistoryRow({ row, detailId, expanded, onToggle }: { row: MonthlyHistoryRow; detailId: string; expanded: boolean; onToggle: () => void }) {
  const month = monthLabel(row)
  const categories: CategoryBreakdown[] = row.categoryBreakdown
  const categoryLabel = categories.length === 0 ? 'Sin gastos por categoría' : `${categories.length} ${categories.length === 1 ? 'categoría' : 'categorías'}`
  return <>
    <tr>
      <th scope="row" className="history-month-cell"><span>{month}</span><Link to={`/boveda?month=${encodeURIComponent(row.monthId)}`}>Volver al mes</Link></th>
      <td className="amount-cell">{formatMoney(row.initialAmountCents)}</td>
      <td className="amount-cell">{formatMoney(row.debtTotal)}</td>
      <td className="amount-cell">{formatMoney(row.debtPending)}</td>
      <td className="amount-cell">{formatMoney(row.dailyExpenses)}</td>
      <td className="amount-cell">{formatMoney(row.balance)}</td>
      <td className="history-detail-cell"><button className="button button-small" type="button" aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>{expanded ? 'Ocultar' : 'Ver'} desglose<span className="sr-only"> de {month}</span></button></td>
    </tr>
    {expanded && <tr id={detailId} className="history-detail-row"><td colSpan={7}><div className="history-breakdown"><h3>Desglose de categorías · {month}</h3>{categories.length === 0 ? <p className="empty-note">{categoryLabel}</p> : <table className="category-history-table" aria-label={`Categorías de ${month}`}><thead><tr><th scope="col">Categoría</th><th scope="col">Estado</th><th scope="col" className="amount-cell">Gastos</th></tr></thead><tbody>{categories.map((category) => <tr key={category.categoryId}><th scope="row">{category.name}</th><td>{category.isArchived ? <span className="archived-label">Archivada</span> : 'Activa'}</td><td className="amount-cell">{formatMoney(category.amountCents)}</td></tr>)}</tbody></table>}</div></td></tr>}
  </>
}

export default HistoryPage
