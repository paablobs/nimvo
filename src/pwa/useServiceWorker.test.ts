import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useServiceWorker } from './useServiceWorker.ts'

type Listener = () => void

class FakeWorker {
  state = 'installing'
  postMessage = vi.fn()
  private listeners: Listener[] = []
  addEventListener(_type: string, listener: Listener) { this.listeners.push(listener) }
  setState(state: string) { this.state = state; this.listeners.forEach((listener) => listener()) }
}

class FakeRegistration {
  update = vi.fn(async () => undefined)
  waiting: FakeWorker | null = null
  installing: FakeWorker | null = null
  private updateFound: Listener[] = []
  addEventListener(_type: string, listener: Listener) { this.updateFound.push(listener) }
  startInstall(worker: FakeWorker) { this.installing = worker; this.updateFound.forEach((listener) => listener()) }
}

function installServiceWorkerMock(controller: object | null, registration: FakeRegistration) {
  const listeners = new Map<string, Set<Listener>>()
  const container = {
    controller,
    register: vi.fn(async () => registration),
    addEventListener: (type: string, listener: Listener) => { listeners.set(type, (listeners.get(type) ?? new Set()).add(listener)) },
    removeEventListener: (type: string, listener: Listener) => { listeners.get(type)?.delete(listener) },
    emit: (type: string) => listeners.get(type)?.forEach((listener) => listener()),
  }
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container })
  return container
}

describe('useServiceWorker', () => {
  const reload = vi.fn()

  beforeEach(() => {
    vi.stubEnv('PROD', true)
    vi.stubEnv('BASE_URL', '/nimvo/')
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    reload.mockClear()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('registers the worker under the deploy base path', async () => {
    const container = installServiceWorkerMock(null, new FakeRegistration())
    renderHook(() => useServiceWorker())
    await act(async () => { await Promise.resolve() })
    expect(container.register).toHaveBeenCalledWith('/nimvo/sw.js', { scope: '/nimvo/' })
  })

  it('reports offline readiness after the first install', async () => {
    const registration = new FakeRegistration()
    installServiceWorkerMock(null, registration)
    const { result } = renderHook(() => useServiceWorker())
    await act(async () => { await Promise.resolve() })
    const worker = new FakeWorker()
    act(() => { registration.startInstall(worker) })
    act(() => { worker.setState('installed') })
    expect(result.current.offlineReady).toBe(true)
    expect(result.current.updateReady).toBe(false)
  })

  it('reports an update when a controlled page gets a new worker, and never activates it by itself', async () => {
    const registration = new FakeRegistration()
    installServiceWorkerMock({}, registration)
    const { result } = renderHook(() => useServiceWorker())
    await act(async () => { await Promise.resolve() })
    const worker = new FakeWorker()
    act(() => { registration.startInstall(worker) })
    act(() => { worker.setState('installed'); registration.waiting = worker })
    expect(result.current.updateReady).toBe(true)
    expect(worker.postMessage).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('applies a waiting update on request and reloads once the new worker takes control', async () => {
    const registration = new FakeRegistration()
    registration.waiting = new FakeWorker()
    const container = installServiceWorkerMock({}, registration)
    const { result } = renderHook(() => useServiceWorker())
    await act(async () => { await Promise.resolve() })
    expect(result.current.updateReady).toBe(true)
    act(() => { result.current.applyUpdate() })
    expect(registration.waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(reload).not.toHaveBeenCalled()
    act(() => { container.emit('controllerchange') })
    expect(reload).toHaveBeenCalledOnce()
  })

  it('offers a reload when another tab already applied the update', async () => {
    const container = installServiceWorkerMock({}, new FakeRegistration())
    const { result } = renderHook(() => useServiceWorker())
    await act(async () => { await Promise.resolve() })
    expect(result.current.updateReady).toBe(false)
    act(() => { container.emit('controllerchange') })
    expect(result.current.updateReady).toBe(true)
    act(() => { result.current.applyUpdate() })
    expect(reload).toHaveBeenCalledOnce()
  })

  it('treats the first controller change of an uncontrolled page as the initial claim, later ones as updates', async () => {
    const container = installServiceWorkerMock(null, new FakeRegistration())
    const { result } = renderHook(() => useServiceWorker())
    await act(async () => { await Promise.resolve() })
    act(() => { container.emit('controllerchange') })
    expect(result.current.updateReady).toBe(false)
    act(() => { container.emit('controllerchange') })
    expect(result.current.updateReady).toBe(true)
  })

  it('checks for a new version periodically and when the tab becomes visible again', async () => {
    vi.useFakeTimers()
    try {
      const registration = new FakeRegistration()
      installServiceWorkerMock({}, registration)
      renderHook(() => useServiceWorker())
      await act(async () => { await Promise.resolve() })
      expect(registration.update).not.toHaveBeenCalled()
      await act(async () => { vi.advanceTimersByTime(60 * 60 * 1000) })
      expect(registration.update).toHaveBeenCalledTimes(1)
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      expect(registration.update).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does nothing outside production builds', () => {
    vi.stubEnv('PROD', false)
    const container = installServiceWorkerMock(null, new FakeRegistration())
    renderHook(() => useServiceWorker())
    expect(container.register).not.toHaveBeenCalled()
  })
})
