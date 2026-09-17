import type { Database } from 'sql.js'
import { calculateMonthlyHistoryBalances, type CategoryBreakdown, type MonthlyHistoryRow } from '../../domain/history.ts'
import { bool, queryRows, safeInteger, text } from './common.ts'

type HistoryQueryRow = Record<string, unknown>

const historyQuery = `
  WITH debt_totals AS (
    SELECT month_id,
      SUM(amount_cents) AS debt_total,
      SUM(CASE WHEN paid_at IS NULL THEN amount_cents ELSE 0 END) AS debt_pending
    FROM debts
    GROUP BY month_id
  ), expense_totals AS (
    SELECT month_id, SUM(amount_cents) AS daily_expenses
    FROM expenses
    GROUP BY month_id
  ), category_totals AS (
    SELECT e.month_id, e.category_id, c.name, c.is_archived,
      SUM(e.amount_cents) AS amount_cents
    FROM expenses AS e
    JOIN categories AS c ON c.id = e.category_id
    GROUP BY e.month_id, e.category_id, c.name, c.is_archived
  )
  SELECT m.id AS month_id, m.year, m.month, m.currency,
    m.initial_amount_cents,
    COALESCE(d.debt_total, 0) AS debt_total,
    COALESCE(d.debt_pending, 0) AS debt_pending,
    COALESCE(e.daily_expenses, 0) AS daily_expenses,
    c.category_id, c.name AS category_name, c.is_archived AS category_is_archived,
    c.amount_cents AS category_amount_cents
  FROM months AS m
  LEFT JOIN debt_totals AS d ON d.month_id = m.id
  LEFT JOIN expense_totals AS e ON e.month_id = m.id
  LEFT JOIN category_totals AS c ON c.month_id = m.id
  ORDER BY m.year DESC, m.month DESC, c.name COLLATE NOCASE ASC, c.category_id ASC
`

const mapCategory = (row: HistoryQueryRow): CategoryBreakdown | null => {
  if (row.category_id == null) return null
  return {
    categoryId: text(row.category_id, 'category_id'),
    name: text(row.category_name, 'category_name'),
    isArchived: bool(row.category_is_archived),
    amountCents: safeInteger(row.category_amount_cents, 'category_amount_cents'),
  }
}

export class HistoryRepository {
  private readonly db: Database
  constructor(db: Database) { this.db = db }

  list(): MonthlyHistoryRow[] {
    const history = new Map<string, MonthlyHistoryRow>()
    for (const row of queryRows(this.db, historyQuery)) {
      const monthId = text(row.month_id, 'month_id')
      let entry = history.get(monthId)
      if (!entry) {
        const year = safeInteger(row.year, 'year')
        const month = safeInteger(row.month, 'month')
        const initialAmountCents = safeInteger(row.initial_amount_cents, 'initial_amount_cents')
        const debtTotal = safeInteger(row.debt_total, 'debt_total')
        const debtPending = safeInteger(row.debt_pending, 'debt_pending')
        const dailyExpenses = safeInteger(row.daily_expenses, 'daily_expenses')
        const balances = calculateMonthlyHistoryBalances({ initialAmountCents, debtTotal, debtPending, dailyExpenses })
        entry = {
          monthId,
          year,
          month,
          currency: text(row.currency, 'currency'),
          initialAmountCents,
          debtTotal,
          debtPending,
          dailyExpenses,
          ...balances,
          categoryBreakdown: [],
        }
        history.set(monthId, entry)
      }
      const category = mapCategory(row)
      if (category) entry.categoryBreakdown.push(category)
    }
    return [...history.values()]
  }
}
