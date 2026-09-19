import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVaultSession } from './useVaultSession.ts'

export const VAULT_INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000

const activityEvents: Array<keyof WindowEventMap> = [
  'pointermove',
  'pointerdown',
  'keydown',
  'wheel',
  'scroll',
]

/** Locks an unlocked vault after fifteen minutes without browser activity. */
function VaultInactivityLock() {
  const navigate = useNavigate()
  const { status, session } = useVaultSession()
  const lastActivityAt = useRef<number | null>(null)
  const timerId = useRef<number | null>(null)
  const locking = useRef(false)

  useEffect(() => {
    if (status !== 'unlocked') return undefined

    lastActivityAt.current = Date.now()
    locking.current = false

    const clearTimer = () => {
      if (timerId.current === null) return
      window.clearTimeout(timerId.current)
      timerId.current = null
    }

    const lockIfExpired = () => {
      timerId.current = null
      const lastActivity = lastActivityAt.current
      if (lastActivity === null) return

      const remaining = VAULT_INACTIVITY_TIMEOUT_MS - (Date.now() - lastActivity)
      if (remaining > 0) {
        timerId.current = window.setTimeout(lockIfExpired, remaining)
        return
      }
      if (locking.current) return

      locking.current = true
      void session.lock()
        .then(() => navigate('/'))
        .catch(() => { locking.current = false })
    }

    const recordActivity = () => {
      lastActivityAt.current = Date.now()
    }

    const checkVisibility = () => {
      if (document.visibilityState === 'visible') lockIfExpired()
    }

    activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }))
    document.addEventListener('visibilitychange', checkVisibility)
    window.addEventListener('focus', checkVisibility)
    timerId.current = window.setTimeout(lockIfExpired, VAULT_INACTIVITY_TIMEOUT_MS)

    return () => {
      clearTimer()
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity))
      document.removeEventListener('visibilitychange', checkVisibility)
      window.removeEventListener('focus', checkVisibility)
      lastActivityAt.current = null
    }
  }, [navigate, session, status])

  return null
}

export default VaultInactivityLock
