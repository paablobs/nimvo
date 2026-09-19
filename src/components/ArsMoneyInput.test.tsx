import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import ArsMoneyInput from './ArsMoneyInput.tsx'
import { normalizeArsMoneyInput, reformatArsMoneyInput, sanitizeArsMoneyInput } from './arsMoneyInput.ts'

describe('ArsMoneyInput', () => {
  it('caps fractions at two digits and formats valid values on blur', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [value, setValue] = useState('')
      return <ArsMoneyInput aria-label="Ingresos" value={value} onChange={(event) => setValue(event.target.value)} />
    }
    render(<ChakraProvider value={defaultSystem}><Harness /></ChakraProvider>)
    const input = screen.getByLabelText('Ingresos')
    await user.type(input, '125000,456')
    expect(input).toHaveValue('125000,45')
    await user.tab()
    expect(input).toHaveValue('125.000,45')
  })

  it('only permits negative values when explicitly enabled', () => {
    expect(sanitizeArsMoneyInput('-100,25')).toBe('100,25')
    expect(sanitizeArsMoneyInput('-100,25', true)).toBe('-100,25')
    expect(sanitizeArsMoneyInput('100,256')).toBe('100,25')
    expect(sanitizeArsMoneyInput('100.2567')).toBe('100.25')
    expect(normalizeArsMoneyInput('-100,25', true)).toBe('-100,25')
    expect(normalizeArsMoneyInput('125,')).toBe('125,00')
  })

  it('accepts a draft from either canonical separator convention after a format switch', () => {
    expect(normalizeArsMoneyInput('1,234.56', false, 'es-AR')).toBe('1.234,56')
    expect(normalizeArsMoneyInput('1.234,56', false, 'en-US')).toBe('1,234.56')
  })

  it('uses the previous format when converting ambiguous grouped values', () => {
    expect(reformatArsMoneyInput('1,234', false, 'en-US', 'es-AR')).toBe('1.234,00')
    expect(reformatArsMoneyInput('1.234', false, 'es-AR', 'en-US')).toBe('1,234.00')
  })
})
