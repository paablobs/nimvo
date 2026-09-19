import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import SeoMetadata from './SeoMetadata.tsx'
import { I18nProvider } from '../i18n/i18n.tsx'

const initialTitle = document.title

beforeEach(() => {
  document.head.insertAdjacentHTML(
    'beforeend',
    '<meta name="robots"><link rel="canonical" href="http://localhost/"><meta property="og:image:alt"><meta name="twitter:image:alt"><script type="application/ld+json">{"description":"English","inLanguage":"en","featureList":["English"]}</script>',
  )
})

afterEach(() => {
  document.title = initialTitle
  document.querySelector('meta[name="robots"]')?.remove()
  document.querySelector('link[rel="canonical"]')?.remove()
  document.querySelector('meta[property="og:image:alt"]')?.remove()
  document.querySelector('meta[name="twitter:image:alt"]')?.remove()
  document.querySelector('script[type="application/ld+json"]')?.remove()
})

describe('SeoMetadata', () => {
  it('keeps the landing page indexable with its canonical URL', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <SeoMetadata />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(document.title).toBe('Nimvo · Local, encrypted personal finance')
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
      expect(document.title).toBe('Vault · Nimvo')
      expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    })
  })

  it('localizes social image metadata and structured data', async () => {
    window.localStorage.setItem('nimvo-language', 'es')
    render(
      <I18nProvider>
        <MemoryRouter initialEntries={['/']}>
          <SeoMetadata />
        </MemoryRouter>
      </I18nProvider>,
    )

    await waitFor(() => {
      expect(document.querySelector('meta[property="og:image:alt"]')).toHaveAttribute('content', 'Nimvo, tus finanzas en un archivo local cifrado')
      expect(document.querySelector('meta[name="twitter:image:alt"]')).toHaveAttribute('content', 'Nimvo, tus finanzas en un archivo local cifrado')
      const data = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}') as Record<string, unknown>
      expect(data.inLanguage).toBe('es-AR')
      expect(data.description).toContain('Organiza ingresos')
      expect(data.featureList).toContain('Archivo local cifrado')
    })
  })
})
