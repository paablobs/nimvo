import { Button, Input } from '@chakra-ui/react'
import { useMemo, useState } from 'react'
import { z } from 'zod'
import AccessibleDialog from '../../components/AccessibleDialog.tsx'
import type { RecurringDebtTemplate } from '../../domain/types.ts'
import { adjustDueDayToMonth, isValidCivilDate } from '../../domain/dates.ts'
import { parseMoneyToCents, formatMoney } from '../../domain/money.ts'
import { parseSignedMoneyToCents } from './money.ts'
import { useVaultSession } from '../vault/useVaultSession.ts'

export type MonthCreated = { id: string; year: number; month: number }

const monthSchema = z.object({
  year: z.number().int().min(1).max(9999),
  month: z.number().int().min(1).max(12),
})

type TemplateChoice = { selected: boolean; amount: string; dueDate: string | null; dueDateCustom: boolean }

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
  templates: RecurringDebtTemplate[]
  onClose: () => void
  onCreated: (month: MonthCreated) => Promise<void>
}

export default function MonthCreationDialog({ templates, onClose, onCreated }: Props) {
  const vault = useVaultSession()
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [initialAmount, setInitialAmount] = useState('0')
  const [choices, setChoices] = useState<Record<string, TemplateChoice>>(() => Object.fromEntries(
    templates.filter((template) => template.isActive).map((template) => [template.id, {
      selected: true,
      amount: template.defaultAmountCents && template.defaultAmountCents > 0 ? formatMoney(template.defaultAmountCents, { symbol: false }) : '',
      dueDate: dateForTemplate(template, today.getFullYear(), today.getMonth() + 1),
      dueDateCustom: false,
    }]),
  ))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function changePeriod(nextYear: number, nextMonth: number) {
    setYear(nextYear)
    setMonth(nextMonth)
    if (!Number.isInteger(nextYear) || nextYear < 1 || nextYear > 9999 || !Number.isInteger(nextMonth) || nextMonth < 1 || nextMonth > 12) return
    setChoices((current) => Object.fromEntries(templates.filter((template) => template.isActive).map((template) => {
      const previous = current[template.id]
      return [template.id, {
        selected: previous?.selected ?? true,
        amount: previous?.amount || (template.defaultAmountCents && template.defaultAmountCents > 0 ? formatMoney(template.defaultAmountCents, { symbol: false }) : ''),
        dueDate: previous?.dueDateCustom && previous.dueDate
          ? dateForPeriod(previous.dueDate, nextYear, nextMonth)
          : previous?.dueDateCustom ? null : dateForTemplate(template, nextYear, nextMonth),
        dueDateCustom: previous?.dueDateCustom ?? false,
      }]
    })))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const parsed = monthSchema.safeParse({ year, month })
    const cents = parseSignedMoneyToCents(initialAmount)
    if (!parsed.success || cents === null) {
      setError('Indica un año, mes e importe inicial válidos.')
      return
    }
    const selected = Object.entries(choices).filter(([, choice]) => choice.selected)
    const templateIds: Array<{ templateId: string; amountCents: number; dueDate?: string | null }> = []
    for (const [templateId, choice] of selected) {
      const amount = parseMoneyToCents(choice.amount)
      if (amount === null || amount <= 0) {
        setError('Las plantillas seleccionadas necesitan un importe mayor que cero.')
        return
      }
      if (choice.dueDate && (!isValidCivilDate(choice.dueDate) || choice.dueDate.slice(0, 7) !== `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`)) {
        setError('Revisá las fechas de vencimiento.')
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
    } catch (cause) {
      setError(cause instanceof Error && cause.message.includes('importe')
        ? cause.message
        : 'No se pudo crear el mes.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AccessibleDialog titleId="new-month-title" onClose={onClose}>
        <div className="dialog-heading">
          <div><p className="eyebrow">Planilla</p><h2 id="new-month-title">Nuevo mes</h2></div>
          <Button className="button button-secondary" type="button" onClick={onClose} aria-label="Cerrar nuevo mes">Cerrar</Button>
        </div>
        <form onSubmit={submit} noValidate>
          <div className="form-grid month-period-fields">
            <label htmlFor="month-year">Año</label>
            <Input id="month-year" data-dialog-autofocus type="number" min={1} max={9999} value={year} onChange={(event) => changePeriod(Number(event.target.value), month)} />
            <label htmlFor="month-number">Mes</label>
            <Input id="month-number" type="number" min={1} max={12} value={month} onChange={(event) => changePeriod(year, Number(event.target.value))} />
          </div>
          <label htmlFor="month-initial">Monto inicial (ARS)</label>
          <Input id="month-initial" inputMode="decimal" value={initialAmount} onChange={(event) => setInitialAmount(event.target.value)} />
          <p className="field-help">Podés usar 125000,00 o 125.000,00.</p>
          <fieldset className="template-choices">
            <legend>Plantillas activas</legend>
            {templates.filter((template) => template.isActive).length === 0 && <p className="empty-note">No hay plantillas activas.</p>}
            {templates.filter((template) => template.isActive).map((template) => {
              const choice = choices[template.id] ?? { selected: true, amount: '', dueDate: dateForTemplate(template, year, month), dueDateCustom: false }
              return (
                <div className="template-choice" key={template.id}>
                  <label className="checkbox-label"><input type="checkbox" checked={choice.selected} onChange={(event) => setChoices((current) => ({ ...current, [template.id]: { ...choice, selected: event.target.checked } }))} /> {template.concept}</label>
                  {choice.selected && <div className="template-overrides">
                    <label>Importe <Input aria-label={`Importe de ${template.concept}`} inputMode="decimal" value={choice.amount} onChange={(event) => setChoices((current) => ({ ...current, [template.id]: { ...choice, amount: event.target.value } }))} /></label>
                    <label>Vencimiento <Input aria-label={`Vencimiento de ${template.concept}`} type="date" value={choice.dueDate ?? ''} onChange={(event) => setChoices((current) => ({ ...current, [template.id]: { ...choice, dueDate: event.target.value ? dateForPeriod(event.target.value, year, month) : null, dueDateCustom: true } }))} /></label>
                  </div>}
                </div>
              )
            })}
          </fieldset>
          {error && <p className="form-message error" role="alert">{error}</p>}
          <div className="form-actions"><Button className="button button-primary" type="submit" loading={busy} disabled={busy}>Crear mes</Button><Button className="button button-secondary" type="button" onClick={onClose} disabled={busy}>Cancelar</Button></div>
        </form>
    </AccessibleDialog>
  )
}
