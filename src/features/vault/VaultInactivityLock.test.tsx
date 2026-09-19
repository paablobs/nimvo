import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VaultProvider } from './VaultProvider.tsx'
import { VaultSession, type DatabaseClientLike } from './VaultSession.ts'
import VaultInactivityLock, { VAULT_INACTIVITY_TIMEOUT_MS } from './VaultInactivityLock.tsx'

function fakeClient(): DatabaseClientLike {
  return {
    open: vi.fn(async () => undefined),
    export: vi.fn(async () => new Uint8Array([1])),
    close: vi.fn(async () => undefined),
    operation: vi.fn(async () => undefined) as DatabaseClientLike['operation'],
  }
}

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{location.pathname}</span>
}

async function renderUnlocked() {
  const client = fakeClient()
  const session = new VaultSession({ createClient: () => client })
  await session.create('password-1')
  const renderResult = render(
    <VaultProvider session={session}>
      <MemoryRouter initialEntries={['/boveda']}>
        <VaultInactivityLock />
        <LocationProbe />
      </MemoryRouter>
    </VaultProvider>,
  )
  return { client, session, unmount: renderResult.unmount }
}

describe('VaultInactivityLock', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not lock before fifteen minutes and locks exactly at the deadline', async () => {
    vi.useFakeTimers()
    const { client, session } = await renderUnlocked()
    expect(session.getSnapshot().dirty).toBe(true)

    await act(async () => { vi.advanceTimersByTime(VAULT_INACTIVITY_TIMEOUT_MS - 1) })
    expect(session.getSnapshot().status).toBe('unlocked')
    expect(client.close).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect(session.getSnapshot().status).toBe('locked')
    expect(client.close).toHaveBeenCalledOnce()
    expect(screen.getByTestId('location')).toHaveTextContent('/')
  })

  it('measures the timeout from the latest activity without resetting the timer on every event', async () => {
    vi.useFakeTimers()
    const { client, session } = await renderUnlocked()

    await act(async () => { vi.advanceTimersByTime(VAULT_INACTIVITY_TIMEOUT_MS / 2) })
    await act(async () => { window.dispatchEvent(new Event('pointermove')) })
    await act(async () => { vi.advanceTimersByTime(VAULT_INACTIVITY_TIMEOUT_MS / 2 - 1) })
    expect(session.getSnapshot().status).toBe('unlocked')
    expect(client.close).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })
    expect(session.getSnapshot().status).toBe('unlocked')

    await act(async () => {
      vi.advanceTimersByTime(VAULT_INACTIVITY_TIMEOUT_MS / 2)
      await Promise.resolve()
    })
    expect(session.getSnapshot().status).toBe('locked')
    expect(client.close).toHaveBeenCalledOnce()
  })

  it('checks elapsed time when returning to a visible tab', async () => {
    vi.useFakeTimers()
    const { client, session } = await renderUnlocked()
    const visibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })

    await act(async () => { vi.setSystemTime(Date.now() + VAULT_INACTIVITY_TIMEOUT_MS + 1) })
    expect(session.getSnapshot().status).toBe('unlocked')

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })
    expect(session.getSnapshot().status).toBe('locked')
    expect(client.close).toHaveBeenCalledOnce()

    if (visibilityState) Object.defineProperty(document, 'visibilityState', visibilityState)
  })

  it('removes activity listeners and timers after unmount', async () => {
    vi.useFakeTimers()
    const { client, unmount } = await renderUnlocked()
    unmount()

    await act(async () => { vi.advanceTimersByTime(VAULT_INACTIVITY_TIMEOUT_MS) })
    expect(client.close).not.toHaveBeenCalled()
  })

  it('stops watching after an explicit lock', async () => {
    vi.useFakeTimers()
    const { client, session } = await renderUnlocked()
    await act(async () => { await session.lock() })

    await act(async () => {
      vi.advanceTimersByTime(VAULT_INACTIVITY_TIMEOUT_MS)
      await Promise.resolve()
    })
    expect(client.close).toHaveBeenCalledOnce()
  })
})
