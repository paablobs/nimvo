import { Input } from '@chakra-ui/react'
import type { ChangeEvent, ComponentProps, FocusEvent } from 'react'
import { normalizeArsMoneyInput, sanitizeArsMoneyInput } from './arsMoneyInput.ts'

type InputProps = ComponentProps<typeof Input>

export interface ArsMoneyInputProps extends Omit<InputProps, 'onChange' | 'onBlur' | 'value'> {
  value: string
  allowNegative?: boolean
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void
}

export default function ArsMoneyInput({ allowNegative = false, onChange, onBlur, ...props }: ArsMoneyInputProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const next = sanitizeArsMoneyInput(event.currentTarget.value, allowNegative)
    if (event.currentTarget.value !== next) event.currentTarget.value = next
    onChange(event)
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    const next = normalizeArsMoneyInput(event.currentTarget.value, allowNegative)
    if (event.currentTarget.value !== next) {
      event.currentTarget.value = next
      onChange(event)
    }
    onBlur?.(event)
  }

  return <Input {...props} value={props.value} inputMode="decimal" onChange={handleChange} onBlur={handleBlur} />
}
