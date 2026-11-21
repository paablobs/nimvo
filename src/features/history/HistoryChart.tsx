import { buildChartSlots, totalSpending, type MonthlyHistoryRow } from '../../domain/history.ts'
import { useI18n } from '../../i18n/useI18n.ts'

const WIDTH = 640
const HEIGHT = 220
const PADDING = { top: 12, right: 8, bottom: 28, left: 8 }

/**
 * Decorative summary of income versus spending for the last 12 calendar
 * months. The history table remains the accessible source of exact figures, so
 * the SVG is exposed as one image. Months missing from the history are empty
 * slots, and negative income is drawn as no income bar (the table shows it).
 */
export default function HistoryChart({ rows, locale }: { rows: MonthlyHistoryRow[]; locale: 'en-US' | 'es-AR' }) {
  const { t } = useI18n()
  const slots = buildChartSlots(rows)
  if (slots.filter((slot) => slot.row).length < 2) return null

  const values = slots.map(({ year, month, row }) => ({ year, month, row, income: row ? Math.max(0, row.initialAmountCents) : 0, spending: row ? totalSpending(row) : 0 }))
  const max = Math.max(1, ...values.flatMap((value) => [value.income, value.spending]))
  const plotWidth = WIDTH - PADDING.left - PADDING.right
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom
  const slotWidth = plotWidth / values.length
  const barWidth = Math.min(22, (slotWidth - 8) / 2)
  const barHeight = (cents: number): number => Math.max(cents > 0 ? 1 : 0, (cents / max) * plotHeight)
  const spansYears = new Set(slots.map((slot) => slot.year)).size > 1
  const monthFormatter = new Intl.DateTimeFormat(locale, spansYears ? { month: 'short', year: '2-digit' } : { month: 'short' })

  return <figure className="history-chart">
    <figcaption>{t('historyChartTitle')}</figcaption>
    <div className="chart-scroll"><svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t('historyChartLabel')} preserveAspectRatio="xMidYMid meet">
      <line className="chart-axis" x1={PADDING.left} x2={WIDTH - PADDING.right} y1={HEIGHT - PADDING.bottom} y2={HEIGHT - PADDING.bottom} />
      {values.map(({ year, month, row, income, spending }, index) => {
        const center = PADDING.left + slotWidth * index + slotWidth / 2
        const base = HEIGHT - PADDING.bottom
        return <g key={`${year}-${month}`} data-month={`${year}-${month}`} data-empty={row ? undefined : 'true'}>
          {row && <>
            <rect className="chart-bar chart-bar--income" x={center - barWidth - 1} y={base - barHeight(income)} width={barWidth} height={barHeight(income)} />
            <rect className="chart-bar chart-bar--spending" x={center + 1} y={base - barHeight(spending)} width={barWidth} height={barHeight(spending)} />
          </>}
          <text className="chart-label" x={center} y={HEIGHT - 8} textAnchor="middle">{monthFormatter.format(new Date(year, month - 1, 1))}</text>
        </g>
      })}
    </svg></div>
    <ul className="chart-legend" aria-hidden="true">
      <li><span className="chart-swatch chart-bar--income" />{t('income')}</li>
      <li><span className="chart-swatch chart-bar--spending" />{t('spending')}</li>
    </ul>
  </figure>
}
