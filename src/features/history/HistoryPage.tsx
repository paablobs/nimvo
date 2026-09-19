import { useEffect, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { formatCurrency } from '../../domain/money.ts'
import type { CategoryBreakdown, MonthlyHistoryRow } from '../../domain/history.ts'
import { useVaultSession } from '../vault/useVaultSession.ts'
import { useI18n } from '../../i18n/useI18n.ts'

const monthLabel = (row: MonthlyHistoryRow, locale: string): string => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(row.year, row.month - 1, 1))

function HistoryPage() {
  const navigate = useNavigate()
  const { t, locale, numberFormat } = useI18n()
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
        setError(t('historyLoadError'))
        setLoadState('error')
      })
    })
    return () => { cancelled = true }
  }, [vault, vault.status, t])

  if (vault.status !== 'unlocked') {
    return <section className="page-section compact-section history-locked" aria-labelledby="history-locked-title">
      <p className="eyebrow">{t('history')}</p>
      <h1 id="history-locked-title">{t('openToContinue')}</h1>
      <button className="button button-primary" type="button" onClick={() => navigate('/abrir')}>{t('openFile')}</button>
    </section>
  }

  return <section className="page-section history-page" aria-labelledby="history-title">
    <header className="history-header">
      <div>
        <p className="eyebrow">{t('historyEyebrow')}</p>
        <h1 id="history-title">{t('monthlyHistory')}</h1>
        <p className="history-lede">{t('historyLead')}</p>
      </div>
      <Link className="button button-secondary" to="/boveda">{t('backToMonth')}</Link>
    </header>

    {loadState === 'error' && <p className="form-message error" role="alert">{error}</p>}
    {loadState === 'loading' && <p className="empty-note" role="status">{t('loadingHistory')}</p>}
    {loadState === 'ready' && rows.length === 0 && <div className="empty-state history-empty"><h2>{t('noMonths')}</h2><p>{t('historyEmpty')}</p><Link className="button button-primary" to="/boveda">{t('goToSheet')}</Link></div>}
    {loadState === 'ready' && rows.length > 0 && <div className="history-table-scroll">
        <table className="data-table history-table" aria-label={t('monthlyHistoryLabel')}>
        <caption className="sr-only">{t('comparisonCaption')}</caption>
        <thead><tr>
          <th scope="col">{t('month')}</th>
          <th scope="col" className="amount-cell">{t('income')}</th>
          <th scope="col" className="amount-cell">{t('totalFixed')}</th>
          <th scope="col" className="amount-cell">{t('pendingFixedShort')}</th>
          <th scope="col" className="amount-cell">{t('dailyExpenses')}</th>
          <th scope="col" className="amount-cell">{t('balance')}</th>
          <th scope="col"><span className="sr-only">{t('breakdown')}</span></th>
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
            translator={t}
            locale={locale}
            numberFormat={numberFormat}
            currency={vault.currency}
            onToggle={() => setExpanded((current) => ({ ...current, [key]: !isExpanded }))}
          />
        })}</tbody>
      </table>
    </div>}
  </section>
}

function HistoryRow({ row, detailId, expanded, onToggle, translator, locale, numberFormat, currency }: { row: MonthlyHistoryRow; detailId: string; expanded: boolean; onToggle: () => void; translator: ReturnType<typeof useI18n>['t']; locale: string; numberFormat: 'en-US' | 'es-AR'; currency: import('../../domain/currency.ts').CurrencyCode }) {
  const month = monthLabel(row, locale === 'es' ? 'es-AR' : 'en-US')
  const categories: CategoryBreakdown[] = row.categoryBreakdown
  const categoryLabel = categories.length === 0 ? translator('noCategoryExpenses') : `${categories.length} ${categories.length === 1 ? translator('categoriesCountOne') : translator('categoriesCountMany')}`
  return <>
    <tr>
      <th scope="row" className="history-month-cell"><span>{month}</span><Link to={`/boveda?month=${encodeURIComponent(row.monthId)}`}>{translator('backToMonth')}</Link></th>
      <td className="amount-cell">{formatCurrency(row.initialAmountCents, currency, { locale: numberFormat })}</td>
      <td className="amount-cell">{formatCurrency(row.debtTotal, currency, { locale: numberFormat })}</td>
      <td className="amount-cell">{formatCurrency(row.debtPending, currency, { locale: numberFormat })}</td>
      <td className="amount-cell">{formatCurrency(row.dailyExpenses, currency, { locale: numberFormat })}</td>
      <td className="amount-cell">{formatCurrency(row.balance, currency, { locale: numberFormat })}</td>
      <td className="history-detail-cell"><button className="button button-small" type="button" aria-expanded={expanded} aria-controls={detailId} onClick={onToggle}>{expanded ? translator('hide') : translator('show')} {translator('breakdown')}<span className="sr-only"> {translator('breakdownOf', { month })}</span></button></td>
    </tr>
    {expanded && <tr id={detailId} className="history-detail-row"><td colSpan={7}><div className="history-breakdown"><h3>{translator('categoryBreakdownTitle', { month })}</h3>{categories.length === 0 ? <p className="empty-note">{categoryLabel}</p> : <table className="category-history-table" aria-label={`${translator('category')} ${month}`}><thead><tr><th scope="col">{translator('category')}</th><th scope="col">{translator('status')}</th><th scope="col" className="amount-cell">{translator('expensesEyebrow')}</th></tr></thead><tbody>{categories.map((category) => <tr key={category.categoryId}><th scope="row">{category.name}</th><td>{category.isArchived ? <span className="archived-label">{translator('archived')}</span> : translator('active')}</td><td className="amount-cell">{formatCurrency(category.amountCents, currency, { locale: numberFormat })}</td></tr>)}</tbody></table>}</div></td></tr>}
  </>
}

export default HistoryPage
