import { Button, Input } from '@chakra-ui/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import AccessibleDialog from '../../components/AccessibleDialog.tsx'
import type { Month, RecurringDebtTemplate } from '../../domain/types.ts'
import { adjustDueDayToMonth, isValidCivilDate } from '../../domain/dates.ts'
import { parseMoneyToCents, formatMoney } from '../../domain/money.ts'
import { parseSignedMoneyToCents } from './money.ts'
import { useVaultSession } from '../vault/useVaultSession.ts'
import ArsMoneyInput from '../../components/ArsMoneyInput.tsx'
import { reformatArsMoneyInput } from '../../components/arsMoneyInput.ts'
import { useI18n } from '../../i18n/useI18n.ts'
import { moneyHelpForFormat } from '../../i18n/core.ts'

export type MonthCreated = { id: string; year: number; month: number }

const monthSchema = z.object({
  year: z.number().int().min(1).max(9999),
  month: z.number().int().min(1).max(12),
})

type TemplateChoice = { selected: boolean; amount: string; dueDate: string | null; dueDateCustom: boolean }

const MAX_AMOUNT_CENTS = 99_999_999_900

type ExistingMonth = Pick<Month, 'year' | 'month' | 'initialAmountCents'>

function previousMonthFor(months: ExistingMonth[], year: number, month: number): ExistingMonth | undefined {
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 1 || month < 1 || month > 12) return undefined
  const previousYear = month === 1 ? year - 1 : year
  const previousNumber = month === 1 ? 12 : month - 1
  return months.find((existing) => existing.year === previousYear && existing.month === previousNumber)
}

function dateForTemplate(template: RecurringDebtTemplate, year: number, month: number): string | null {
  if (template.dueDay === null) return null
  const day = adjustDueDayToMonth(template.dueDay, year, month)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dateForPeriod(date: string, year: number, month: number): string {
  const day = Number(date.slice(-2))
  const safeDay = Number.isInteger(day) && day > 0 ? adjustDueDayToMonth(day, year, month) : 1
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
}

interface Props {
  existingMonths?: ExistingMonth[]
  templates: RecurringDebtTemplate[]
  onClose: () => void
  onCreated: (month: MonthCreated) => Promise<void>
}

export default function MonthCreationDialog({ existingMonths = [], templates, onClose, onCreated }: Props) {
  const vault = useVaultSession()
  const { locale, numberFormat, t } = useI18n()
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const defaultPrevious = previousMonthFor(existingMonths, today.getFullYear(), today.getMonth() + 1)
  const [incomeMode, setIncomeMode] = useState<'previous' | 'manual'>(defaultPrevious ? 'previous' : 'manual')
  const [initialAmount, setInitialAmount] = useState(defaultPrevious ? formatMoney(defaultPrevious.initialAmountCents, { symbol: false, locale: numberFormat }) : '0')
  const previous = useMemo(() => previousMonthFor(existingMonths, year, month), [existingMonths, year, month])
  const [choices, setChoices] = useState<Record<string, TemplateChoice>>(() => Object.fromEntries(
    templates.filter((template) => template.isActive).map((template) => [template.id, {
      selected: true,
      amount: template.defaultAmountCents && template.defaultAmountCents > 0 ? formatMoney(template.defaultAmountCents, { symbol: false, locale: numberFormat }) : '',
      dueDate: dateForTemplate(template, today.getFullYear(), today.getMonth() + 1),
      dueDateCustom: false,
    }]),
  ))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const previousNumberFormat = useRef(numberFormat)

  useEffect(() => {
    if (previousNumberFormat.current === numberFormat) return
    setInitialAmount((current) => reformatArsMoneyInput(current, true, previousNumberFormat.current, numberFormat))
    setChoices((current) => Object.fromEntries(Object.entries(current).map(([id, choice]) => [id, {
      ...choice,
      amount: reformatArsMoneyInput(choice.amount, false, previousNumberFormat.current, numberFormat),
    }])))
    previousNumberFormat.current = numberFormat
  }, [numberFormat])

  function changePeriod(nextYear: number, nextMonth: number) {
    setYear(nextYear)
    setMonth(nextMonth)
    if (!Number.isInteger(nextYear) || nextYear < 1 || nextYear > 9999 || !Number.isInteger(nextMonth) || nextMonth < 1 || nextMonth > 12) return
    const nextPrevious = previousMonthFor(existingMonths, nextYear, nextMonth)
    if (!nextPrevious) {
      setIncomeMode('manual')
    } else if (incomeMode === 'previous') {
      setInitialAmount(formatMoney(nextPrevious.initialAmountCents, { symbol: false, locale: numberFormat }))
    }
    setChoices((current) => Object.fromEntries(templates.filter((template) => template.isActive).map((template) => {
      const previous = current[template.id]
      return [template.id, {
        selected: previous?.selected ?? true,
        amount: previous?.amount || (template.defaultAmountCents && template.defaultAmountCents > 0 ? formatMoney(template.defaultAmountCents, { symbol: false, locale: numberFormat }) : ''),
        dueDate: previous?.dueDateCustom && previous.dueDate
          ? dateForPeriod(previous.dueDate, nextYear, nextMonth)
          : previous?.dueDateCustom ? null : dateForTemplate(template, nextYear, nextMonth),
        dueDateCustom: previous?.dueDateCustom ?? false,
      }]
    })))
  }

  function changeYear(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 4)
    changePeriod(digits === '' ? 0 : Number(digits), month)
  }

  function changeMonth(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 2)
    if (digits !== '' && Number(digits) > 12) return
    changePeriod(year, digits === '' ? 0 : Number(digits))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const parsed = monthSchema.safeParse({ year, month })
    const cents = parseSignedMoneyToCents(initialAmount, numberFormat)
    if (!parsed.success || cents === null || Math.abs(cents) > MAX_AMOUNT_CENTS) {
      setError(t('invalidMonth'))
      return
    }
    if (existingMonths.some((existing) => existing.year === year && existing.month === month)) {
      setError(t('duplicateMonth'))
      return
    }
    const selected = Object.entries(choices).filter(([, choice]) => choice.selected)
    const templateIds: Array<{ templateId: string; amountCents: number; dueDate?: string | null }> = []
    for (const [templateId, choice] of selected) {
      const amount = parseMoneyToCents(choice.amount, numberFormat)
      if (amount === null || amount <= 0 || amount > MAX_AMOUNT_CENTS) {
        setError(t('templateAmountInvalid'))
        return
      }
      if (choice.dueDate && (!isValidCivilDate(choice.dueDate) || choice.dueDate.slice(0, 7) !== `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`)) {
        setError(t('dateInvalid'))
        return
      }
      templateIds.push({ templateId, amountCents: amount, dueDate: choice.dueDate })
    }
    setBusy(true)
    try {
      const result = await vault.operation<{ month: MonthCreated; debts: unknown[] }>({
        kind: 'months.createWithTemplates',
        input: { year, month, initialAmountCents: cents, currency: 'ARS' },
        templateIds,
      } as never)
      await onCreated(result.month)
      onClose()
    } catch {
      setError(t('monthCreateError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccessibleDialog titleId="new-month-title" onClose={onClose}>
        <div className="dialog-heading">
          <div><p className="eyebrow">{t('monthlySheet')}</p><h2 id="new-month-title">{t('newMonthTitle')}</h2></div>
          <Button className="button button-secondary" type="button" onClick={onClose} aria-label={t('close')}>{t('close')}</Button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="form-grid month-period-fields">
            <label htmlFor="month-year">{t('year')}</label>
            <Input id="month-year" data-dialog-autofocus type="number" min={1} max={9999} maxLength={4} value={year} onChange={(event) => changeYear(event.target.value)} />
            <label htmlFor="month-number">{t('month')}</label>
            <Input id="month-number" type="number" min={1} max={12} maxLength={2} value={month} onChange={(event) => changeMonth(event.target.value)} />
          </div>
          <fieldset className="income-choice">
            <legend>{t('income')}</legend>
            {previous && <label><input type="radio" name="income-mode" value="previous" checked={incomeMode === 'previous'} onChange={() => { setIncomeMode('previous'); setInitialAmount(formatMoney(previous.initialAmountCents, { symbol: false, locale: numberFormat })) }} /> {t('repeatPreviousIncome', { amount: formatMoney(previous.initialAmountCents, { locale: numberFormat }) })}</label>}
            <label><input type="radio" name="income-mode" value="manual" checked={incomeMode === 'manual' || previous === undefined} onChange={() => setIncomeMode('manual')} /> {t('enterManualIncome')}</label>
            <label htmlFor="month-initial">{t('amountArs')}</label>
            <ArsMoneyInput id="month-initial" allowNegative locale={numberFormat} value={initialAmount} disabled={incomeMode === 'previous' && previous !== undefined} onChange={(event) => setInitialAmount(event.target.value)} />
            <p className="field-help">{moneyHelpForFormat(locale, numberFormat)}</p>
          </fieldset>
          <fieldset className="template-choices">
            <legend>{t('activeTemplates')}</legend>
            {templates.filter((template) => template.isActive).length === 0 && <p className="empty-note">{t('noActiveTemplates')}</p>}
            {templates.filter((template) => template.isActive).map((template) => {
              const choice = choices[template.id] ?? { selected: true, amount: '', dueDate: dateForTemplate(template, year, month), dueDateCustom: false }
              return (
                <div className="template-choice" key={template.id}>
                  <label className="checkbox-label"><input type="checkbox" checked={choice.selected} onChange={(event) => setChoices((current) => ({ ...current, [template.id]: { ...choice, selected: event.target.checked } }))} /> {template.concept}</label>
                  {choice.selected && <div className="template-overrides">
                    <label>{t('amount')} <ArsMoneyInput locale={numberFormat} aria-label={t('amountFor', { concept: template.concept })} value={choice.amount} onChange={(event) => setChoices((current) => ({ ...current, [template.id]: { ...choice, amount: event.target.value } }))} /></label>
                    <label>{t('dueDate')} <Input aria-label={t('dueFor', { concept: template.concept })} type="date" value={choice.dueDate ?? ''} onChange={(event) => setChoices((current) => ({ ...current, [template.id]: { ...choice, dueDate: event.target.value ? dateForPeriod(event.target.value, year, month) : null, dueDateCustom: true } }))} /></label>
                  </div>}
                </div>
              )
            })}
          </fieldset>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <div className="form-actions"><Button className="button button-primary" type="submit" loading={busy} disabled={busy}>{t('monthCreate')}</Button><Button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>{t('cancel')}</Button></div>
        </form>
    </AccessibleDialog>
  )
}
