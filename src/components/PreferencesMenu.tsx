import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/useI18n.ts'
import { useTheme } from '../theme/theme.ts'

export default function PreferencesMenu() {
  const { locale, setLocale, numberFormat, setNumberFormat, t } = useI18n()
  const { mode, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const closeMenu = useCallback(() => {
    setOpen(false)
    queueMicrotask(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!open) return undefined
    queueMicrotask(() => {
      popoverRef.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus()
    })
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) closeMenu() }
    const escapeAndTrap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
        return
      }
      if (event.key !== 'Tab' || !popoverRef.current) return
      const controls = Array.from(popoverRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea'))
        .filter((control) => !control.hasAttribute('disabled'))
      if (controls.length === 0) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escapeAndTrap)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escapeAndTrap) }
  }, [closeMenu, open])
  return <div className="preferences-menu" ref={ref}>
    <button ref={triggerRef} className="theme-toggle preferences-trigger" type="button" aria-label={t('preferences')} aria-expanded={open} aria-controls="preferences-popover" onClick={() => { if (open) closeMenu(); else setOpen(true) }}>⚙ <span className="sr-only">{t('preferences')}</span></button>
    {open && <div ref={popoverRef} className="preferences-popover" id="preferences-popover" role="dialog" aria-label={t('preferences')}>
      <fieldset><legend>{t('language')}</legend><div className="preference-options"><button type="button" className={locale === 'en' ? 'selected' : ''} aria-pressed={locale === 'en'} onClick={() => { setLocale('en'); closeMenu() }}>EN</button><button type="button" className={locale === 'es' ? 'selected' : ''} aria-pressed={locale === 'es'} onClick={() => { setLocale('es'); closeMenu() }}>ES</button></div></fieldset>
      <fieldset><legend>{t('numberFormat')}</legend><div className="preference-options"><button type="button" className={numberFormat === 'en-US' ? 'selected' : ''} aria-pressed={numberFormat === 'en-US'} onClick={() => { setNumberFormat('en-US'); closeMenu() }}>1,234.56</button><button type="button" className={numberFormat === 'es-AR' ? 'selected' : ''} aria-pressed={numberFormat === 'es-AR'} onClick={() => { setNumberFormat('es-AR'); closeMenu() }}>1.234,56</button></div></fieldset>
      <fieldset><legend>{t('theme')}</legend><div className="preference-options"><button type="button" className={mode === 'light' ? 'selected' : ''} aria-pressed={mode === 'light'} onClick={() => { if (mode === 'dark') toggle(); closeMenu() }}>{t('light')}</button><button type="button" className={mode === 'dark' ? 'selected' : ''} aria-pressed={mode === 'dark'} onClick={() => { if (mode === 'light') toggle(); closeMenu() }}>{t('dark')}</button></div></fieldset>
    </div>}
  </div>
}
