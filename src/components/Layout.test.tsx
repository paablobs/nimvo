import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import Layout from './Layout.tsx'

function renderLayout(path: string) {
  render(
    <ChakraProvider value={defaultSystem}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/boveda" element={<div>Bóveda</div>} />
            <Route path="/boveda/historial" element={<div>Historial</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('Layout navigation', () => {
  it('marks only Bóveda as current on the vault page', () => {
    renderLayout('/boveda')

    expect(screen.getByRole('link', { name: 'Bóveda' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Historial' })).not.toHaveAttribute('aria-current')
  })

  it('marks only Historial as current on the history page', () => {
    renderLayout('/boveda/historial')

    expect(screen.getByRole('link', { name: 'Bóveda' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'Historial' })).toHaveAttribute('aria-current', 'page')
  })
})
