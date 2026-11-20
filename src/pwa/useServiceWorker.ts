import { useCallback, useEffect, useRef, useState } from 'react'

export interface ServiceWorkerState {
  /** The app shell has been cached and can start without a network. */
  offlineReady: boolean
  /** A new version finished installing and waits for the user to apply it. */
  updateReady: boolean
  /** Activates the waiting version and reloads the page. */
  applyUpdate: () => void
  dismissOfflineReady: () => void
}

/**
 * Registers the precache service worker in production builds. A new version is
 * never activated automatically: the caller decides when `applyUpdate` runs,
 * because reloading discards the in-memory vault.
 */
export function useServiceWorker(): ServiceWorkerState {
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const registration = useRef<ServiceWorkerRegistration | null>(null)

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return undefined
    let cancelled = false
    const base = import.meta.env.BASE_URL
    const container = navigator.serviceWorker
    const hadController = container.controller !== null

    // Another tab applied an update: this tab now runs under the new worker but
    // still holds old code (and possibly unsaved work), so offer a guarded reload.
    const handleControllerChange = () => { if (hadController && !cancelled) setUpdateReady(true) }
    container.addEventListener('controllerchange', handleControllerChange)

    const track = (worker: ServiceWorker) => {
      worker.addEventListener('statechange', () => {
        if (cancelled || worker.state !== 'installed') return
        if (navigator.serviceWorker.controller) setUpdateReady(true)
        else setOfflineReady(true)
      })
    }

    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).then((current) => {
      if (cancelled) return
      registration.current = current
      if (current.waiting && navigator.serviceWorker.controller) setUpdateReady(true)
      if (current.installing) track(current.installing)
      current.addEventListener('updatefound', () => { if (current.installing) track(current.installing) })
    }).catch(() => { /* Offline support is optional; the app works without it. */ })

    return () => {
      cancelled = true
      container.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [])

  const applyUpdate = useCallback(() => {
    const waiting = registration.current?.waiting
    if (!waiting) {
      // The new worker is already active (another tab applied it): just reload.
      window.location.reload()
      return
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }, [])

  const dismissOfflineReady = useCallback(() => setOfflineReady(false), [])

  return { offlineReady, updateReady, applyUpdate, dismissOfflineReady }
}
