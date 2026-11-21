import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { I18nProvider } from '../i18n/i18n.tsx'
import UpdateBanner, { type UpdateBannerProps } from './UpdateBanner.tsx'

const base: UpdateBannerProps = { offlineReady: false, updateReady: false, vaultOpen: false, vaultDirty: false, onUpdate: vi.fn(), onDismissOfflineReady: vi.fn() }
const renderBanner = (props: Partial<UpdateBannerProps>) => render(<I18nProvider><UpdateBanner {...base} {...props} /></I18nProvider>)

describe('UpdateBanner', () => {
  it('renders nothing when there is nothing to report', () => {
    const { container } = renderBanner({})
    expect(container).toBeEmptyDOMElement()
  })

  it('announces offline readiness and can be dismissed', async () => {
    const onDismissOfflineReady = vi.fn()
    renderBanner({ offlineReady: true, onDismissOfflineReady })
    expect(screen.getByRole('status')).toHaveTextContent('ready to work offline')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close' }))
    expect(onDismissOfflineReady).toHaveBeenCalledOnce()
  })

  it('offers an update when no vault is open', async () => {
    const onUpdate = vi.fn()
    renderBanner({ updateReady: true, onUpdate })
    await userEvent.setup().click(screen.getByRole('button', { name: 'Update now' }))
    expect(onUpdate).toHaveBeenCalledOnce()
  })

  it('warns that updating locks an open vault', () => {
    renderBanner({ updateReady: true, vaultOpen: true })
    expect(screen.getByRole('status')).toHaveTextContent('locks the vault')
    expect(screen.getByRole('button', { name: 'Update now' })).toBeEnabled()
  })

  it('blocks the update while there are unsaved changes', async () => {
    const onUpdate = vi.fn()
    renderBanner({ updateReady: true, vaultOpen: true, vaultDirty: true, onUpdate })
    expect(screen.getByRole('status')).toHaveTextContent('Save your changes first')
    const button = screen.getByRole('button', { name: 'Update now' })
    expect(button).toBeDisabled()
    await userEvent.setup().click(button)
    expect(onUpdate).not.toHaveBeenCalled()
  })
})
