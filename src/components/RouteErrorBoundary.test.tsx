import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '../i18n/i18n.tsx'
import RouteErrorBoundary from './RouteErrorBoundary.tsx'

function Broken(): never { throw new Error('chunk missing') }

describe('RouteErrorBoundary', () => {
  it('renders children when nothing fails', () => {
    render(<I18nProvider><MemoryRouter><RouteErrorBoundary><p>content</p></RouteErrorBoundary></MemoryRouter></I18nProvider>)
    expect(screen.getByText('content')).toBeVisible()
  })

  it('contains a failing route and links back to the vault', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<I18nProvider><MemoryRouter><RouteErrorBoundary><Broken /></RouteErrorBoundary></MemoryRouter></I18nProvider>)
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded')
    expect(screen.getByRole('link', { name: 'Back to the vault' })).toHaveAttribute('href', '/boveda')
    vi.restoreAllMocks()
  })
})
