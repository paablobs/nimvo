import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import SeoMetadata from './SeoMetadata.tsx'

const initialTitle = document.title

beforeEach(() => {
  document.head.insertAdjacentHTML(
    'beforeend',
    '<meta name="robots"><link rel="canonical" href="http://localhost/">',
  )
})

afterEach(() => {
  document.title = initialTitle
  document.querySelector('meta[name="robots"]')?.remove()
  document.querySelector('link[rel="canonical"]')?.remove()
})

describe('SeoMetadata', () => {
  it('keeps the landing page indexable with its canonical URL', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <SeoMetadata />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.title).toBe('Nimvo · Finanzas personales locales y cifradas')
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')
      expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute(
        'href',
        'https://paablobs.github.io/nimvo/',
      )
    })
  })

  it('prevents indexing operational routes', async () => {
    render(
      <MemoryRouter initialEntries={['/boveda']}>
        <SeoMetadata />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.title).toBe('Bóveda · Nimvo')
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    })
  })
})
