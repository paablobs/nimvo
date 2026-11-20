import { totalSpending, type MonthlyHistoryRow } from '../../domain/history.ts'
import { useI18n } from '../../i18n/useI18n.ts'

const MAX_MONTHS = 12
const WIDTH = 640
const HEIGHT = 220
const PADDING = { top: 12, right: 8, bottom: 28, left: 8 }

/**
 * Decorative summary of income versus spending. The history table remains
 * the accessible source of exact figures, so the SVG is exposed as one image.
 */
export default function HistoryChart({ rows, locale }: { rows: MonthlyHistoryRow[]; locale: 'en-US' | 'es-AR' }) {
  const { t } = useI18n()
  const months = rows.slice(0, MAX_MONTHS).reverse()
  if (months.length < 2) return null

  const values = months.map((row) => ({ row, income: Math.max(0, row.initialAmountCents), spending: totalSpending(row) }))
  const max = Math.max(1, ...values.flatMap((value) => [value.income, value.spending]))
  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom
  const slot = plotWidth / values.length
  const barWidth = Math.min(22, (slot - 8) / 2)
  const barHeight = (cents: number): number => Math.max(cents > 0 ? 1 : 0, (cents / max) * plotHeight)
  const spansYears = new Set(months.map((row) => row.year)).size > 1
  const monthFormatter = new Intl.DateTimeFormat(locale, spansYears ? { month: 'short', year: '2-digit' } : { month: 'short' })

  return <figure className="history-chart">
    <figcaption>{t('historyChartTitle')}</figcaption>
    <div className="chart-scroll"><svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t('historyChartLabel')} preserveAspectRatio="xMidYMid meet">
      <line className="chart-axis" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={HEIGHT - PADDING.bottom} y2={HEIGHT - PADDING.bottom} />
      {values.map(({ row, income, spending }, index) => {
        const center = PADDING.left + slot * index + slot / 2
        const base = HEIGHT - PADDING.bottom
        return <g key={row.monthId}>
          <rect className="chart-bar chart-bar--income" x={center - barWidth - 1} y={base - barHeight(income)} width={barWidth} height={barHeight(income)} />
          <rect className="chart-bar chart-bar--spending" x={center + 1} y={base - barHeight(spending)} width={barWidth} height={barHeight(spending)} />
          <text className="chart-label" x={center} y={HEIGHT - 8} textAnchor="middle">{monthFormatter.format(new Date(row.year, row.month - 1, 1))}</text>
        </g>
      })}
    </svg></div>
    <ul className="chart-legend" aria-hidden="true">
      <li><span className="chart-swatch chart-bar--income" />{t('income')}</li>
      <li><span className="chart-swatch chart-bar--spending" />{t('spending')}</li>
    </ul>
  </figure>
}
