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
    <Route path="/boveda" element={<div>Vault</div>} />
    <Route path="/boveda/historial" element={<div>History</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ChakraProvider>,
  )
}

describe('Layout navigation', () => {
  it('marks only Vault as current on the vault page', () => {
    renderLayout('/boveda')

    expect(screen.getByRole('link', { name: 'Vault' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'History' })).not.toHaveAttribute('aria-current')
  })

  it('marks only History as current on the history page', () => {
    renderLayout('/boveda/historial')

    expect(screen.getByRole('link', { name: 'Vault' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page')
  })
})
