import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n/useI18n.ts'
import { loadPasswordScorer, type PasswordScore } from './passwordStrength.ts'

const LABEL_KEYS = ['strengthVeryWeak', 'strengthWeak', 'strengthFair', 'strengthGood', 'strengthStrong'] as const
const DEBOUNCE_MS = 200

/**
 * Advisory strength indicator. It never blocks account creation: a weak
 * password only shows a warning because the user keeps the final decision.
 */
export const PASSWORD_STRENGTH_ID = 'password-strength'

export default function PasswordStrength({ password }: { password: string }) {
  const { t } = useI18n()
  const [result, setResult] = useState<{ password: string; score: PasswordScore } | null>(null)

  useEffect(() => {
    if (!password) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      loadPasswordScorer().then((score) => {
        if (!cancelled) setResult({ password, score: score(password) })
      }).catch(() => { /* The indicator is optional; creation keeps working. */ })
    }, DEBOUNCE_MS)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [password])

  if (!password || result?.password !== password) return <div id={PASSWORD_STRENGTH_ID} className="password-strength" aria-live="polite" />
  const { score } = result
  return <div id={PASSWORD_STRENGTH_ID} className="password-strength" aria-live="polite" data-score={score}>
    <div className="strength-bar" aria-hidden="true">{[0, 1, 2, 3].map((index) => <span key={index} className={index < Math.max(1, score) ? 'filled' : undefined} />)}</div>
    <p className="strength-label">{t('passwordStrength')}: <strong>{t(LABEL_KEYS[score])}</strong></p>
    {score < 3 && <p className="strength-warning">{t('passwordWeakWarning')}</p>}
  </div>
}
