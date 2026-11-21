import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { MonthlyHistoryRow } from '../../domain/history.ts'
import { I18nProvider } from '../../i18n/i18n.tsx'
import HistoryChart from './HistoryChart.tsx'

const row = (year: number, month: number, overrides: Partial<MonthlyHistoryRow> = {}): MonthlyHistoryRow => ({
  monthId: `${year}-${month}`, year, month, currency: 'ARS', initialAmountCents: 100_000, debtTotal: 20_000, debtPending: 0, dailyExpenses: 30_000, balance: 50_000, categoryBreakdown: [], ...overrides,
})

const renderChart = (rows: MonthlyHistoryRow[], locale: 'en-US' | 'es-AR' = 'en-US') =>
  render(<I18nProvider><HistoryChart rows={rows} locale={locale} /></I18nProvider>)

const groups = (container: HTMLElement) => Array.from(container.querySelectorAll('svg g'))
const bars = (group: Element) => Array.from(group.querySelectorAll('rect'))

describe('HistoryChart', () => {
  it('renders nothing with fewer than two months of data', () => {
    expect(renderChart([row(2026, 3)]).container).toBeEmptyDOMElement()
    expect(renderChart([row(2026, 3), row(2026, 1)]).container.querySelector('svg')).not.toBeNull()
  })

  it('leaves an empty labelled slot for a missing month instead of joining the neighbours', () => {
    const { container } = renderChart([row(2026, 4), row(2026, 2), row(2026, 1)])
    const slots = groups(container)
    expect(slots.map((slot) => slot.textContent)).toEqual(['Jan', 'Feb', 'Mar', 'Apr'])
    expect(bars(slots[2])).toHaveLength(0)
    expect(slots[2]).toHaveAttribute('data-empty', 'true')
    expect(bars(slots[3])).toHaveLength(2)
  })

  it('adds a two-digit year to labels when the months span years', () => {
    const { container } = renderChart([row(2026, 1), row(2025, 12)])
    expect(groups(container).map((slot) => slot.textContent)).toEqual(['Dec 25', 'Jan 26'])
  })

  it('shows at most the last 12 calendar months', () => {
    const rows = Array.from({ length: 15 }, (_, index) => row(2025 + Math.floor((14 - index) / 12), ((14 - index) % 12) + 1))
    expect(groups(renderChart(rows).container)).toHaveLength(12)
  })

  it('draws no income bar for negative income and no spending bar for zero spending', () => {
    const { container } = renderChart([
      row(2026, 2, { initialAmountCents: -50_000, debtTotal: 10_000, dailyExpenses: 0 }),
      row(2026, 1, { initialAmountCents: 80_000, debtTotal: 0, dailyExpenses: 0 }),
    ])
    const [january, february] = groups(container)
    const heights = (group: Element) => bars(group).map((bar) => Number(bar.getAttribute('height')))
    expect(heights(january)[0]).toBeGreaterThan(0)
    expect(heights(january)[1]).toBe(0)
    expect(heights(february)[0]).toBe(0)
    expect(heights(february)[1]).toBeGreaterThan(0)
  })

  it('exposes one image with a text alternative that points at the table', () => {
    renderChart([row(2026, 2), row(2026, 1)])
    expect(screen.getByRole('img', { name: /table below lists the exact amounts/ })).toBeInTheDocument()
  })

  it('localizes month names', () => {
    const { container } = renderChart([row(2026, 2), row(2026, 1)], 'es-AR')
    expect(groups(container).map((slot) => slot.textContent?.toLowerCase())).toEqual([expect.stringContaining('ene'), expect.stringContaining('feb')])
  })
})
